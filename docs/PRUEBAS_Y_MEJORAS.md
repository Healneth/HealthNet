# PRUEBAS AUTOMATIZADAS, LIMITACIONES Y PLAN DE MEJORAS
**Validaciones de Calidad, Estado de Implementación, Limitaciones Técnicas y Hoja de Ruta de Escalabilidad**  
*Versión:* 1.0.0  
*Fecha:* Noviembre 2026  

---

## 1. SUITE DE PRUEBAS AUTOMATIZADAS (VITEST)

El proyecto cuenta con una suite de pruebas unitarias implementada con **Vitest 2.1.9**, diseñada para ejecutarse tanto en desarrollo local como en canalizaciones de integración continua (CI/CD).

### 1.1. Resumen de Ejecución de Pruebas
* **Total de Archivos de Prueba**: 4 archivos.
* **Total de Pruebas Unitarias**: 16 pruebas ejecutadas y aprobadas (100% éxito).
* **Tiempo Promedio de Ejecución**: ~1.9 segundos.
* **Comando de Ejecución**:
  ```bash
  npm test -- --run
  ```

### 1.2. Detalle de Archivos de Prueba y Cobertura

#### 1. `src/tests/phoneValidator.test.ts` (5 pruebas)
Valida la normalización de números telefónicos para despacho de alertas SMS mediante el estándar internacional E.164.
* **Aspectos Evaluados**:
  * Conversión de números mexicanos de 10 dígitos locales (`5512345678` $\rightarrow$ `+525512345678`).
  * Limpieza de caracteres no numéricos (espacios, guiones, paréntesis).
  * Validación de números internacionales que ya cuentan con prefijo `+`.
  * Rechazo de números incompletos o con formatos no válidos.
  * Comportamiento ante entradas nulas o vacías.

#### 2. `src/tests/kpiCalculations.test.ts` (4 pruebas)
Valida la precisión matemática de los cálculos clínicos desplegados en los tableros y tarjetas de pacientes.
* **Aspectos Evaluados**:
  * Cálculo exacto del promedio de frecuencia cardíaca de los pacientes monitoreados.
  * Cálculo exacto de la temperatura promedio del piso.
  * Detección precisa de pacientes fuera de rango clínico (taquicardia > 110 bpm, bradicardia < 50 bpm, fiebre > 38.0 °C).
  * Exclusión correcta de pacientes archivados en los cálculos diarios.

#### 3. `src/tests/shiftService.test.ts` (4 pruebas)
Valida las reglas de negocio de programación de turnos y detección de conflictos horarios.
* **Aspectos Evaluados**:
  * Prevención y detección de solapamiento de turnos para un mismo enfermero en la misma semana y día.
  * Validación de horarios institucionales: Matutino (07:00-15:00), Vespertino (15:00-23:00) y Nocturno (23:00-07:00).
  * Cálculo correcto de las fechas límite de inicio de semana (lunes).
  * Persistencia e integridad de la asignación semanal.

#### 4. `src/tests/dataIntegrity.test.ts` (3 pruebas)
Valida el cumplimiento estricto de la **Regla de Oro** de telemetría médica.
* **Aspectos Evaluados**:
  * Verificación de no-falsificación de mediciones en pacientes con brazaletes reales asignados.
  * Aislamiento de valores simulados exclusivamente a dispositivos etiquetados como pruebas de simulador.
  * Integridad de los atributos fisiológicos almacenados.

---

## 2. ESTADO ACTUAL DE IMPLEMENTACIÓN: COMPARATIVA REAL

| Componente / Servicio | Nivel de Implementación | Observación Técnica |
| :--- | :---: | :--- |
| **Frontend SPA (React + TypeScript)** | **100% Implementado** | Vistas, componentes, modo claro/oscuro, gráficos EKG y exportación a PDF totalmente operativos. |
| **Control de Acceso (RBAC)** | **100% Implementado** | Reglas activas en frontend y en la función Lambda. Restricción del simulador y logout protegidos. |
| **Paginación Multicriterio (10/30/50/100)**| **100% Implementado** | Integrada en Tickets (`AlertsPage`), Monitoreo (`MonitoringPage`) y Usuarios (`UsersManagementPage`). |
| **Esquema de Base de Datos PostgreSQL** | **100% Diseñado y Consolidado** | Esquema v9.0 listo e idempotente (`healthnet_database_schema_master.sql`). |
| **Backend REST / IoT (AWS Lambda)** | **100% Implementado en Código** | Controlador completo con router modular, CORS, deduplicación de alertas y validación RBAC. |
| **Conexión Activa a Instancia RDS** | **Configurado Parcialmente** | El código está listo, pero la instancia previa de AWS RDS se encuentra detenida / inaccesible (fallo de resolución DNS). |
| **AWS IoT Core (Broker MQTT)** | **Implementado en Código** | Cliente WebSockets SigV4 listo; requiere endpoint activo en `.env` para recibir hardware físico. |
| **Amazon SNS (Despacho de SMS)** | **Implementado en Código** | Función `sendSmsAlert` configurada; requiere salida del sandbox de AWS para enviar a números no verificados. |
| **Amazon SES (Correos Transaccionales)**| **Preparado en Código** | Lógica de invitaciones lista; requiere verificación de dominio y credenciales SMTP en producción. |
| **Plantilla CloudFormation** | **Preparado** | Archivo `aws/cloudformation_healthnet_stack.yaml` estructurado para despliegue automatizado. |

---

## 3. LIMITACIONES TÉCNICAS IDENTIFICADAS

1. **Dependencia de la Instancia RDS en AWS**:
   * *Situación*: Si la base de datos PostgreSQL en Amazon RDS se encuentra apagada o no accesible por DNS, la API Gateway responde con HTTP 500.
   * *Mitigación Actual*: El frontend cuenta con un mecanismo de resiliencia que detecta el fallo y conmuta automáticamente a almacenamiento local (`localStorage`) para que el usuario pueda interactuar con la plataforma sin que la aplicación colapse.
2. **Generación de Telemetría Sintética en Dispositivos de Demostración**:
   * *Situación*: Cuando no hay hardware físico ESP32 transmitiendo por MQTT, el simulador genera mediciones matemáticas aproximadas.
   * *Mitigación Actual*: Se implementó la Regla de Oro para garantizar que los pacientes que tengan brazaletes físicos registrados solo muestren datos reales procedentes de la base de datos o de AWS IoT Core.
3. **Sandbox en Amazon SNS**:
   * *Situación*: En cuentas nuevas de AWS, Amazon SNS se encuentra en modo *Sandbox*, lo que restringe el envío de mensajes SMS exclusivamente a números telefónicos verificados previamente en la consola de AWS.

---

## 4. PLAN DE MEJORAS Y TRABAJO FUTURO

### 4.1. Rendimiento y Optimización del Frontend
* **Virtualización de Listados Grandes**: En centros con más de 200 pacientes o miles de tickets históricos, implementar virtualización de listas con librerías como `@tanstack/react-virtual` para renderizar en el DOM únicamente las filas visibles en pantalla.
* **Gestión de Caché con React Query / TanStack Query**: Reemplazar las peticiones HTTP directas con `@tanstack/react-query` para manejo automático de reintentos, invalidación de consultas y sincronización en segundo plano.
* **Optimización de Gráficas en Tiempo Real**: Establecer ventanas deslizantes fijas (máximo 60 puntos de muestra) para los componentes Recharts, reduciendo el consumo de memoria en sesiones prolongadas.

### 4.2. Seguridad y Resiliencia en AWS
* **Despliegue de AWS WAF (Web Application Firewall)**: Integrar WAF frente a AWS API Gateway con reglas de bloqueo geográfico, mitigación de ataques DDoS y limitación de tasa (*Rate Limiting*) de 100 peticiones por minuto por IP.
* **Integración con AWS Secrets Manager**: Reemplazar las variables de entorno de base de datos en la función Lambda por llamadas a Secrets Manager con rotación automática de credenciales cada 90 días.
* **Migración a Amazon RDS Multi-AZ**: Configurar la base de datos PostgreSQL con réplica síncrona en una segunda zona de disponibilidad para garantizar tolerancia a fallos en caso de desastre en el centro de datos.

### 4.3. Arquitectura y Escalabilidad
* **Desacoplamiento Asíncrono con Amazon SQS**: Introducir una cola Amazon SQS entre AWS IoT Core y la función Lambda para amortiguar picos masivos de alertas en situaciones de evacuación o siniestro, asegurando que ningún evento de emergencia se pierda.
* **Amazon Aurora Serverless v2**: Evaluar la migración de RDS PostgreSQL a Aurora Serverless v2 para escalar automáticamente la capacidad de cómputo y memoria según la demanda horaria del centro asistencial.

### 4.4. Integración y Automatización DevOps
* **Canalización CI/CD con GitHub Actions**: Automatizar la ejecución de pruebas unitarias (`npm test`), verificación de tipos (`tsc -b`) y empaquetado de producción en cada *pull request* hacia la rama `main`.
* **Despliegue Automatizado con AWS SAM o Terraform**: Desarrollar scripts de aprovisionamiento continuo que sincronicen automáticamente las funciones Lambda y el esquema SQL con la nube.

### 4.5. Mejoras Funcionales y Clínicas
* **Aplicación Móvil para Enfermería**: Desarrollar una versión móvil complementaria (React Native o PWA) para que los enfermeros reciban notificaciones push de alta prioridad y registren notas clínicas directamente junto a la cama del paciente.
* **Geolocalización en Interiores con Balizas BLE**: Aprovechar las capacidades Bluetooth del ESP32 para triangular la posición del paciente dentro del edificio mediante balizas (*beacons*) fijas en pasillos y habitaciones.
* **Interoperabilidad con Estándares Médicos HL7 / FHIR**: Implementar adaptadores para exportar e importar datos hacia sistemas hospitalarios externos bajo el estándar FHIR (*Fast Healthcare Interoperability Resources*).
