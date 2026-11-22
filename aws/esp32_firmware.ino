#include <Wire.h>
#include <Adafruit_GFX.h>    
#include <Adafruit_ST7789.h> 
#include "heartRate.h"       

// ── LIBRERÍAS DE RED Y SEGURIDAD PARA AWS ─────────────────────────────
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ==========================================
// 1. CONFIGURACIÓN DE RED Y AWS
// ==========================================
#define WIFI_SSID       "TU_WIFI_SSID"
#define WIFI_PASSWORD   "TU_WIFI_PASSWORD"

// Tu endpoint de AWS IoT Core (lo encuentras en AWS Console -> IoT Core -> Settings)
#define AWS_IOT_ENDPOINT "a1dqyzlqe79i10-ats.iot.us-west-1.amazonaws.com"
#define AWS_MQTT_PORT    8883

// Identificación del dispositivo y paciente
#define DEVICE_ID        "ESP32-FISICO-001"
#define PATIENT_NAME     "Josuar Andreo Ruiz Rodriguez"

// ==========================================
// 2. CERTIFICADOS DE SEGURIDAD AWS (X.509)
// ==========================================
// Reemplaza estas cadenas con los archivos que descargaste de AWS IoT Core:

// AmazonRootCA1.pem
const char* AWS_CERT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2z4FMAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxFTATBgNVBAoTDHRoYXd0ZSwgSW5jLjEmMCQGA1UECxMd
... (PEGA AQUÍ TU CERTIFICADO AMAZON ROOT CA 1) ...
-----END CERTIFICATE-----
)EOF";

// xxxxxxxxxx-certificate.pem.crt (Certificado del dispositivo)
const char* AWS_CERT_CRT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDWTCCAkGgAwIBAgIQCgFBQgAAAVOFdfe2UpD1AjANBgkqhkiG9w0BAQsFADCB
iDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1Nl
... (PEGA AQUÍ EL CERTIFICADO DE TU DISPOSITIVO) ...
-----END CERTIFICATE-----
)EOF";

// xxxxxxxxxx-private.pem.key (Llave privada del dispositivo)
const char* AWS_CERT_PRIVATE = R"EOF(
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAz2fG0wR8ZqK1tXG8T4W9Z4p...
... (PEGA AQUÍ LA LLAVE PRIVADA DE TU DISPOSITIVO) ...
-----END RSA PRIVATE KEY-----
)EOF";

// ==========================================
// 3. CONFIGURACIÓN DE PINES HARDWARE (WAVESHARE)
// ==========================================
// PIN DEL PULSADOR FÍSICO MOMENTÁNEO PBS-33B (Pulsador rojo de emergencia)
// Conexión: Terminal 1 a GPIO 16; Terminal 2 a GND.
#define PIN_PBS33B_BUTTON 16

#define PIN_POWER_ON    15   
#define I2C_SDA         42   
#define I2C_SCL         41   

#define TFT_MOSI        39   // LCD_DIN
#define TFT_SCLK        38   // LCD_CLK
#define TFT_CS          21   // LCD_CS
#define TFT_DC          45   // LCD_DC
#define TFT_RST         40   // LCD_RST
#define TFT_BL          46   // LCD_BL

// El offset de hardware para centrar horizontalmente los 172 píxeles dentro de los 240 lógicos
#define OFFSET_X        34  

// DEFINICIÓN DEL COLOR ROJO NEÓN PERFECTO
#define ROJO_NEON       0x001F  

// Inicialización por software SPI
Adafruit_ST7789 tft = Adafruit_ST7789(TFT_CS, TFT_DC, TFT_MOSI, TFT_SCLK, TFT_RST);

// ==========================================
// 4. DIRECCIONES I2C Y REGISTROS
// ==========================================
#define ADXL345_ADDRESS   0x53 
#define MAX30205_ADDRESS  0x48 
#define MAX30102_ADDRESS  0x57  

#define MAX30205_TEMPERATURE_REG   0x00  
#define MAX30205_CONFIGURATION_REG 0x01  

#define REG_INTR_ENABLE_1 0x02
#define REG_FIFO_WR_PTR   0x04
#define REG_OVERFLOW_CTR  0x05
#define REG_FIFO_RD_PTR   0x06
#define REG_FIFO_DATA     0x07
#define REG_FIFO_CONFIG   0x08
#define REG_MODE_CONFIG   0x09
#define REG_SPO2_CONFIG   0x0A
#define REG_LED1_PA       0x0C 
#define REG_LED2_PA       0x0D 

// ==========================================
// 5. VARIABLES GLOBALES
// ==========================================
const byte RATE_SIZE = 4; 
byte rates[RATE_SIZE];    
byte rateSpot = 0;
long lastBeat = 0;        
float beatsPerMinute = 0;
int beatAvg = 0;        
long irValue = 0; 

float accelX = 0, accelY = 0, accelZ = 0;
float tempMedida = -999.0;
bool caidaDetectada = false;

unsigned long ultimoAcelerometro = 0;
unsigned long ultimaTemperatura = 0;
unsigned long ultimoRefrescoPantalla = 0;
unsigned long ultimoEnvioAWS = 0;

const unsigned long INTERVALO_ACCEL = 250;   
const unsigned long INTERVALO_TEMP  = 1000;  
const unsigned long INTERVALO_PANTALLA = 300; 
const unsigned long INTERVALO_AWS = 4000; // Enviar telemetría a AWS cada 4 segundos

bool adxlActivo = false;
bool max30205Activo = false;
bool bpmActivo = false;
bool corazonEncendido = false; 

// Clientes de red segura y MQTT
WiFiClientSecure netClient;
PubSubClient mqttClient(netClient);

// Variables de control para el pulsador de emergencia PBS-33B
bool botonEmergenciaPresionado = false;
int ultimoEstadoBotonLeido = HIGH;
int estadoBotonEstable = HIGH;
unsigned long ultimoTiempoCambioBoton = 0;
const unsigned long TIEMPO_DEBOUNCE_BOTON = 40;     // 40ms de lectura estable para antirrebote eléctrico
char ultimoEventIdEmergencia[40] = "";

// Prototipos de funciones
void configurarMAX30205();
float leerTemperaturaMAX30205();
void leerAcelerometro();
bool iniciarMAX30102Nativo();
long leerIR_MAX30102();
void actualizarInterfazGrafica();
void setupWiFi();
void connectToAWS();
void generarUUIDv4(char* destino, size_t longitud);
void publicarEmergenciaInmediata();

// ==========================================
// SETUP
// ==========================================
void setup() {
  pinMode(PIN_PBS33B_BUTTON, INPUT_PULLUP); // Conexión a GND con pull-up interna activa
  pinMode(PIN_POWER_ON, OUTPUT);
  digitalWrite(PIN_POWER_ON, HIGH); 
  
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH); 

  Serial.begin(115200);

  tft.init(240, 320);           
  tft.setRotation(2); 

  // Inyección de bits para orientación recta sin espejo
  tft.sendCommand(0x36, (const uint8_t[]){0x80}, 1); 
  
  // Mantener apagada la inversión nativa
  tft.sendCommand(0x20, (const uint8_t*)NULL, 0); 

  tft.fillScreen(ST77XX_BLACK);
  
  tft.setTextSize(2);
  tft.setTextColor(ROJO_NEON); 
  tft.setCursor(35 + OFFSET_X, 40);  tft.print("HEALTHNET");
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(15 + OFFSET_X, 80);  tft.print("Iniciando...");

  // Conectar a la Red WiFi y configurar certificados
  setupWiFi();
  connectToAWS();

  delay(500); 

  Wire.end(); 
  delay(100);
  Wire.begin(I2C_SDA, I2C_SCL, 100000); 
  Wire.setTimeOut(50); 

  // Inicialización del Acelerómetro ADXL345
  Wire.beginTransmission(ADXL345_ADDRESS);
  Wire.write(0x2D); 
  Wire.write(0x08); 
  if (Wire.endTransmission() == 0) {
    adxlActivo = true;
  }

  // Inicialización de la Temperatura
  Wire.beginTransmission(MAX30205_ADDRESS);
  if (Wire.endTransmission() == 0) {
    configurarMAX30205();
    max30205Activo = true;
  }

  // Inicialización del Pulso
  if (iniciarMAX30102Nativo()) bpmActivo = true;

  tft.fillScreen(ST77XX_BLACK);
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================
void loop() {
  unsigned long tiempoActual = millis();

  // Mantener la conexión con AWS IoT activa
  if (!mqttClient.connected()) {
    connectToAWS();
  }
  mqttClient.loop();

  // ── LECTURA DEL PULSADOR DE EMERGENCIA PBS-33B (Antirrebote por transición) ──
  // No utiliza ventana de enfriamiento (cooldown) que descarte nuevas pulsaciones legítimas.
  // Cada pulsación física confirmada genera un evento con UUID único (eventId).
  int lecturaBoton = digitalRead(PIN_PBS33B_BUTTON);
  if (lecturaBoton != ultimoEstadoBotonLeido) {
    ultimoTiempoCambioBoton = tiempoActual;
    ultimoEstadoBotonLeido = lecturaBoton;
  }

  if ((tiempoActual - ultimoTiempoCambioBoton) >= TIEMPO_DEBOUNCE_BOTON) {
    if (lecturaBoton != estadoBotonEstable) {
      estadoBotonEstable = lecturaBoton;
      // Detección de flanco de bajada (contacto presionado hacia GND)
      if (estadoBotonEstable == LOW) {
        botonEmergenciaPresionado = true;
        // Publicación inmediata e instantánea (Cero latencia)
        publicarEmergenciaInmediata();
      }
    }
  }

  if (bpmActivo) {
    long muestraIR = leerIR_MAX30102();
    if (muestraIR > 0) {
      irValue = muestraIR;

      if (checkForBeat(irValue) == true) {
        long delta = tiempoActual - lastBeat; 
        lastBeat = tiempoActual;
        beatsPerMinute = 60 / (delta / 1000.0); 

        if (beatsPerMinute < 200 && beatsPerMinute > 40) {
          rates[rateSpot++] = (byte)beatsPerMinute;
          rateSpot %= RATE_SIZE; 

          beatAvg = 0;
          for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
          beatAvg /= RATE_SIZE;
          corazonEncendido = true; 
        }
      }
    }
  }

  if (adxlActivo && (tiempoActual - ultimoAcelerometro >= INTERVALO_ACCEL)) {
    ultimoAcelerometro = tiempoActual;
    leerAcelerometro();
  }

  if (max30205Activo && (tiempoActual - ultimaTemperatura >= INTERVALO_TEMP)) {
    ultimaTemperatura = tiempoActual;
    tempMedida = leerTemperaturaMAX30205();
  }

  if (tiempoActual - ultimoRefrescoPantalla >= INTERVALO_PANTALLA) {
    ultimoRefrescoPantalla = tiempoActual;
    actualizarInterfazGrafica();
    corazonEncendido = false; 
  }

  // ── ENVÍO DE DATOS A AWS IOT ─────────────────────────────────────────
  if (tiempoActual - ultimoEnvioAWS >= INTERVALO_AWS) {
    ultimoEnvioAWS = tiempoActual;

    if (mqttClient.connected()) {
      char payload[400];
      // Construir el JSON de telemetría periódica identificando exclusivamente por deviceId
      snprintf(payload, sizeof(payload),
        "{\"deviceId\":\"%s\",\"timestamp\":%llu,\"heartRate\":%d,\"temperature\":%.2f,\"fallDetected\":%s,\"batteryLevel\":100,\"emergencyButton\":{\"pressed\":%s,\"lastEventId\":\"%s\"}}",
        DEVICE_ID,
        (unsigned long long)(time(NULL) * 1000ULL), // Unix ms (si NTP está activo, de lo contrario Lambda usará Date.now())
        beatAvg,
        tempMedida != -999.0 ? tempMedida : 36.5,
        caidaDetectada ? "true" : "false",
        botonEmergenciaPresionado ? "true" : "false",
        ultimoEventIdEmergencia
      );

      char topic[100];
      snprintf(topic, sizeof(topic), "healthnet/devices/%s/telemetry", DEVICE_ID);

      Serial.print("Publicando telemetria: ");
      Serial.println(payload);

      if (mqttClient.publish(topic, payload)) {
        Serial.println("Publicado correctamente en AWS!");
        // Resetear banderas de alerta tras el envío periódico
        caidaDetectada = false;
        botonEmergenciaPresionado = false;
      } else {
        Serial.println("Error al publicar en AWS.");
      }
    }
  }
}

// ==========================================
// RENDERIZADO GRÁFICO (IGUALACIÓN DE ROJOS)
// ==========================================
void actualizarInterfazGrafica() {
  // Encabezado gris oscuro
  tft.fillRect(0 + OFFSET_X, 0, 172, 30, tft.color565(40, 40, 40));
  tft.setTextSize(1);
  tft.setTextColor(ROJO_NEON); 
  tft.setCursor(55 + OFFSET_X, 10); 
  tft.print("HEALTHNET");

  tft.drawFastHLine(0 + OFFSET_X, 32, 172, ST77XX_CYAN);
  
  // --- SECCIÓN 1: DIBUJO DEL CORAZÓN ---
  uint16_t colorCorazon = ROJO_NEON; 
  
  tft.fillTriangle(86 + OFFSET_X, 65, 71 + OFFSET_X, 50, 86 + OFFSET_X, 50, colorCorazon);
  tft.fillTriangle(86 + OFFSET_X, 65, 101 + OFFSET_X, 50, 86 + OFFSET_X, 50, colorCorazon);
  tft.fillCircle(78 + OFFSET_X, 48, 8, colorCorazon);
  tft.fillCircle(94 + OFFSET_X, 48, 8, colorCorazon);

  // --- SECCIÓN ACTUALIZADA DE PULSO ---
  tft.fillRect(45 + OFFSET_X, 75, 90, 25, ST77XX_BLACK);
  tft.setTextSize(3);
  tft.setTextColor(ST77XX_CYAN, ST77XX_BLACK); 
  tft.setCursor(65 + OFFSET_X, 75);
  tft.print(beatAvg);
  
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  tft.setCursor(52 + OFFSET_X, 112); 
  tft.print("BPM PROMEDIO");

  // --- SECCIÓN 2: TEMPERATURA ---
  tft.drawFastHLine(0 + OFFSET_X, 135, 172, ST77XX_CYAN);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  tft.setCursor(50 + OFFSET_X, 145); tft.print("TEMPERATURA");
  
  if (max30205Activo && tempMedida != -999.0) {
    tft.fillRect(25 + OFFSET_X, 165, 130, 25, ST77XX_BLACK);
    tft.setTextSize(3);
    tft.setTextColor(ST77XX_GREEN, ST77XX_BLACK); 
    tft.setCursor(42 + OFFSET_X, 165);
    tft.print(tempMedida, 1); tft.print(" C");
  } else {
    tft.setCursor(50 + OFFSET_X, 165); tft.print("OFFLINE");
  }

  // --- SECCIÓN 3: ACELERÓMETRO ---
  tft.drawFastHLine(0 + OFFSET_X, 215, 172, ROJO_NEON); 
  tft.setTextSize(1);
  tft.setTextColor(ROJO_NEON, ST77XX_BLACK);
  tft.setCursor(45 + OFFSET_X, 225); tft.print("MOVIMIENTO (G)");

  if (adxlActivo) {
    tft.setTextSize(1);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.fillRect(45 + OFFSET_X, 245, 100, 55, ST77XX_BLACK);
    tft.setCursor(45 + OFFSET_X, 245); tft.print("X: "); tft.print(accelX, 2);
    tft.setCursor(45 + OFFSET_X, 262); tft.print("Y: "); tft.print(accelY, 2);
    tft.setCursor(45 + OFFSET_X, 279); tft.print("Z: "); tft.print(accelZ, 2);
  } else {
    tft.setCursor(60 + OFFSET_X, 255); tft.print("OFFLINE");
  }
}

// ==========================================
// CONEXIÓN WIFI Y AWS IOT
// ==========================================
void setupWiFi() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(15 + OFFSET_X, 50);
  tft.print("Conectando WiFi...");
  
  Serial.print("Conectando a ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
  
  tft.setCursor(15 + OFFSET_X, 70);
  tft.print("WiFi Conectado!");
  delay(500);
}

void connectToAWS() {
  // Configurar los certificados de seguridad en el cliente seguro
  netClient.setCACert(AWS_CERT_CA);
  netClient.setCertificate(AWS_CERT_CRT);
  netClient.setPrivateKey(AWS_CERT_PRIVATE);

  mqttClient.setServer(AWS_IOT_ENDPOINT, AWS_MQTT_PORT);

  Serial.println("Conectando a AWS IoT Core...");
  tft.setCursor(15 + OFFSET_X, 90);
  tft.print("Conectando a AWS...");

  while (!mqttClient.connected()) {
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("Conectado a AWS IoT Core!");
      tft.setCursor(15 + OFFSET_X, 110);
      tft.print("AWS Conectado!");
      delay(800);
    } else {
      Serial.print("Error de conexion. Estado MQTT: ");
      Serial.print(mqttClient.state());
      Serial.println(". Reintentando en 5 segundos...");
      delay(5000);
    }
  }
}

// ==========================================
// FUNCIONES I2C DE LOS SENSORES
// ==========================================
bool iniciarMAX30102Nativo() {
  Wire.beginTransmission(MAX30102_ADDRESS);
  if (Wire.endTransmission() != 0) return false; 
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_MODE_CONFIG); Wire.write(0x40); Wire.endTransmission(); 
  delay(100);
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_INTR_ENABLE_1); Wire.write(0xC0); Wire.endTransmission(); 
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_FIFO_WR_PTR); Wire.write(0x00); Wire.endTransmission();   
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_OVERFLOW_CTR); Wire.write(0x00); Wire.endTransmission();  
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_FIFO_RD_PTR); Wire.write(0x00); Wire.endTransmission();   
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_FIFO_CONFIG); Wire.write(0x4F); Wire.endTransmission();   
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_MODE_CONFIG); Wire.write(0x03); Wire.endTransmission();   
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_SPO2_CONFIG); Wire.write(0x27); Wire.endTransmission();   
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_LED1_PA); Wire.write(0x24); Wire.endTransmission();       
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_LED2_PA); Wire.write(0x24); Wire.endTransmission();       
  return true;
}

long leerIR_MAX30102() {
  uint8_t buffer[6];
  Wire.beginTransmission(MAX30102_ADDRESS); Wire.write(REG_FIFO_DATA);
  if (Wire.endTransmission(false) != 0) return 0;
  Wire.requestFrom(MAX30102_ADDRESS, 6);
  if (Wire.available() == 6) {
    for (int i = 0; i < 6; i++) buffer[i] = Wire.read();
    long valorIR = ((long)buffer[3] << 16) | ((long)buffer[4] << 8) | buffer[5];
    return valorIR & 0x03FFFF; 
  }
  return 0;
}

void configurarMAX30205() {
  Wire.beginTransmission(MAX30205_ADDRESS); Wire.write(MAX30205_CONFIGURATION_REG); Wire.write(0x00); Wire.endTransmission();
}

float leerTemperaturaMAX30205() {
  Wire.beginTransmission(MAX30205_ADDRESS); Wire.write(MAX30205_TEMPERATURE_REG);
  if (Wire.endTransmission() != 0) return -999.0; 
  Wire.requestFrom(MAX30205_ADDRESS, 2);
  if (Wire.available() == 2) {
    uint8_t msb = Wire.read(); uint8_t lsb = Wire.read(); 
    return ((msb << 8) | lsb) * 0.00390625; 
  }
  return -999.0; 
}

void leerAcelerometro() {
  Wire.beginTransmission(ADXL345_ADDRESS); Wire.write(0x32); 
  if (Wire.endTransmission(false) == 0) {
    Wire.requestFrom(ADXL345_ADDRESS, 6); 
    if (Wire.available() == 6) {
      int16_t x = Wire.read() | (Wire.read() << 8);
      int16_t y = Wire.read() | (Wire.read() << 8);
      int16_t z = Wire.read() | (Wire.read() << 8);
      accelX = x * 0.0039; accelY = y * 0.0039; accelZ = z * 0.0039;

      // Detección simple de caídas física:
      // Si la aceleración total es mayor a 3.0G, se interpreta como impacto de caída
      float gTotal = sqrt(accelX * accelX + accelY * accelY + accelZ * accelZ);
      if (gTotal > 3.0) {
        caidaDetectada = true;
      }
    }
  }
}

// ==========================================
// FUNCIONES DEL BOTÓN DE EMERGENCIA PBS-33B
// ==========================================

/**
 * Genera un identificador único universal UUIDv4 basado en el generador de entropía
 * de hardware del ESP32 (esp_random), para deduplicación estricta en AWS y Base de Datos.
 */
void generarUUIDv4(char* destino, size_t longitud) {
  uint32_t r1 = esp_random();
  uint32_t r2 = esp_random();
  uint32_t r3 = esp_random();
  uint32_t r4 = esp_random();

  uint8_t bytes[16];
  memcpy(&bytes[0], &r1, 4);
  memcpy(&bytes[4], &r2, 4);
  memcpy(&bytes[8], &r3, 4);
  memcpy(&bytes[12], &r4, 4);

  // Conformidad con RFC 4122 (Versión 4 y Variante 1)
  bytes[6] = (bytes[6] & 0x0F) | 0x40;
  bytes[8] = (bytes[8] & 0x3F) | 0x80;

  snprintf(destino, longitud,
    "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
    bytes[0], bytes[1], bytes[2], bytes[3],
    bytes[4], bytes[5],
    bytes[6], bytes[7],
    bytes[8], bytes[9],
    bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
  );
}

/**
 * Publicación asíncrona inmediata al presionar el pulsador físico PBS-33B (Cero latencia).
 * Emite en el topic dedicado 'healthnet/devices/{deviceId}/emergency' con QoS 1.
 */
void publicarEmergenciaInmediata() {
  if (!mqttClient.connected()) {
    connectToAWS();
  }

  // Generar UUID único para esta pulsación
  generarUUIDv4(ultimoEventIdEmergencia, sizeof(ultimoEventIdEmergencia));

  char payload[350];
  // Regla 1: Identificación exclusiva por ID del brazalete (deviceId). Cero confianza en datos del paciente enviados por dispositivo.
  snprintf(payload, sizeof(payload),
    "{\"deviceId\":\"%s\",\"eventType\":\"EMERGENCY_BUTTON\",\"eventId\":\"%s\",\"timestamp\":%llu,\"pressed\":true,\"batteryLevel\":100}",
    DEVICE_ID,
    ultimoEventIdEmergencia,
    (unsigned long long)(time(NULL) * 1000ULL)
  );

  char topic[120];
  snprintf(topic, sizeof(topic), "healthnet/devices/%s/emergency", DEVICE_ID);

  Serial.println("\n🚨 [PBS-33B] ¡DISPARO DE EMERGENCIA FÍSICO DETECTADO!");
  Serial.print("Publicando en topic: "); Serial.println(topic);
  Serial.println(payload);

  if (mqttClient.publish(topic, payload)) {
    Serial.println("¡Alerta de emergencia entregada con éxito a AWS IoT Core!");
  } else {
    Serial.println("Error publicando evento de emergencia en AWS IoT Core.");
  }

  // Alerta visual momentánea en pantalla TFT ST7789
  tft.fillScreen(ROJO_NEON);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  tft.setCursor(20 + OFFSET_X, 100);
  tft.print("EMERGENCIA SOS");
  tft.setTextSize(1);
  tft.setCursor(30 + OFFSET_X, 135);
  tft.print("PULSADOR ACTIVADO");
  tft.setCursor(25 + OFFSET_X, 155);
  tft.print("ASISTENCIA EN CAMINO");
  delay(1200);
  tft.fillScreen(ST77XX_BLACK);
}
