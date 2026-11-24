# HEALTHNET — SISTEMA INTEGRAL DE MONITOREO CLÍNICO Y TELEMETRÍA IOT

> **Documentación Oficial del Proyecto**  
> *Versión del Sistema:* 1.0.0  
> *Entorno de Ejecución:* SPA React 18 + TypeScript + AWS Serverless + PostgreSQL RDS + AWS IoT Core  
> *Última Actualización:* Noviembre 2026  

---

## 1. PRESENTACIÓN GENERAL DEL PROYECTO

### 1.1. Nombre y Descripción
**HealthNet** es una plataforma sociosanitaria de telemetría médica continua en tiempo real y gestión operativa diseñada para centros de atención a adultos mayores, residencias geriátricas y clínicas de convalecencia. 

El sistema integra dispositivos portátiles tipo brazalete (basados en microcontroladores ESP32 con sensores biomédicos y pulsador de emergencia) con un panel web centralizado de supervisión clínica, alertas en tiempo real y asignación formal de incidentes por turnos de enfermería.

### 1.2. Problemática que Atiende
En centros geriátricos y residencias asistenciales, la atención oportuna a emergencias de pacientes adultos mayores presenta retos críticos:
1. **Caídas accidentales no advertidas**, especialmente durante turnos nocturnos o en habitaciones privadas.
2. **Descompensaciones súbitas de signos vitales** (taquicardias, bradicardias, crisis hipotérmicas o cuadros febriles) que no se detectan hasta la siguiente ronda rutinaria.
3. **Pérdida de continuidad asistencial y falta de trazabilidad** en las entregas de turno entre el personal de enfermería, provocando incidentes desatendidos o duplicación de esfuerzos.
4. **Falta de registro inmutable y auditable** ante eventuales contingencias médico-legales.

### 1.3. Objetivo Principal
Proveer una solución integral y resiliente que capture variables fisiológicas continuas, detecte eventos de riesgo (caídas y botón de pánico) en milisegundos, y canalice automáticamente cada incidente hacia el personal de enfermería en guardia activa según el turno y la ubicación del paciente, manteniendo una bitácora médica inmutable.

### 1.4. Alcance y Capacidades Principales
* **Monitoreo Fisiológico en Tiempo Real**: Recepción y visualización continua de pulso cardíaco (BPM), temperatura corporal (°C), detección de caídas y nivel de batería vía MQTT sobre WebSockets.
* **Sistema de Tickets Clínicos con Folio Único**: Transformación de alertas en tickets operativos con ciclo de vida estricto (*Recibido* $\rightarrow$ *En Progreso* $\rightarrow$ *Completado*), notas obligatorias de resolución y registro de traspasos de turno.
* **Control de Acceso Basado en Roles (RBAC)**: Segregación multidimensional de responsabilidades para **Administrador**, **Doctor** y **Enfermero**.
* **Gestión de Turnos y Cobertura Territorial**: Matriz semanal de turnos (Matutino, Vespertino, Nocturno) con asignación de hasta 3 enfermeros por paciente (uno por cada turno diario) y algoritmos de prevención de colisiones horarias.
* **Paginación y Filtrado Multicriterio**: Navegación en bloques de 10, 30, 50 y 100 registros con preservación de filtros y reinicio automático a página 1 al modificar criterios de búsqueda.
* **Generación de Reportes Clínicos**: Emisión y descarga en el navegador de expedientes e informes individuales en formato PDF con diseño institucional.
* **Modo Dual (Cloud AWS / Resiliencia Local)**: Conexión nativa a servicios de AWS (IoT Core, Cognito, Lambda, RDS PostgreSQL, SNS, SES) con conmutación automática a modo local persistente en caso de desconexión o demostración sin conexión a internet.

---

## 2. TIPOS DE USUARIOS Y ROLES DEL SISTEMA

HealthNet define tres perfiles institucionales diferenciados:

| Rol | Identificador | Enfoque Asistencial / Operativo |
| :--- | :---: | :--- |
| **Administrador** | `admin` | Gestión de altas/bajas de pacientes y brazaletes, control de cuentas de personal, suspensión administrativa, configuración de horarios y turnos de enfermería, y acceso exclusivo al Simulador IoT. |
| **Doctor / Médico** | `doctor` | Supervisión médica y diagnóstica, visualización del tablero clínico, generación de informes en PDF, consulta de expedientes acumulados y calibración exclusiva de umbrales clínicos de alerta. |
| **Enfermero / Asistencial** | `nurse` | Atención directa a pie de cama, recepción y atención de alertas de pacientes asignados, redacción de notas clínicas inmutables, resolución de tickets y entrega formal de turno. |

---

## 3. RESUMEN DE TECNOLOGÍAS UTILIZADAS

```
Frontend:           React 18.3.1 + TypeScript 5.5.3 + Vite 5.4.2
Diseño Visual:      Tailwind CSS 3.4.14 + Lucide React 0.383.0 + Modo Oscuro/Claro
Estado Global:      Zustand 4.5.5
Telemetría IoT:     MQTT.js 5.10.1 (WebSockets WSS con AWS IoT Core)
Autenticación:      AWS Amplify v6.8.0 (Amazon Cognito User Pools & Identity Pools)
Gráficas Médicas:   Recharts 2.12.7
Reportes Clínicos:  jsPDF 4.2.1 + html2canvas 1.4.1
Backend Serverless: AWS Lambda (Node.js 18.x/20.x) + AWS API Gateway REST API
Base de Datos:      Amazon RDS PostgreSQL 13+ (Esquema v9.0 consolidado)
Mensajería Cloud:   Amazon SNS (SMS E.164) + Amazon SES (Correos de invitación)
Pruebas Unitarias:  Vitest 2.1.9 (16 pruebas automatizadas)
```

---

## 4. GUÍA RÁPIDA DE INSTALACIÓN Y EJECUCIÓN

### 4.1. Requisitos Previos
* **Node.js**: Versión 18.18.0 o superior (Node.js 20 LTS recomendado).
* **Gestor de Paquetes**: `npm` v9+ o `pnpm` v9+.
* **Navegador Web**: Google Chrome o Microsoft Edge en resolución 1920×1080 (zoom 100%).

### 4.2. Instalación de Dependencias
Clone el repositorio y ejecute en la raíz del proyecto:
```bash
npm install
```

### 4.3. Configuración de Variables de Entorno
Copie la plantilla de variables de entorno:
```bash
cp .env.example .env
```
Edite `.env` con los parámetros de su infraestructura en AWS:
```env
# Región AWS
VITE_AWS_REGION=us-west-1

# Amazon Cognito
VITE_COGNITO_USER_POOL_ID=us-west-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_COGNITO_IDENTITY_POOL_ID=us-west-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# AWS IoT Core
VITE_IOT_ENDPOINT=xxxxxxxxxxxxxx-ats.iot.us-west-1.amazonaws.com

# AWS API Gateway
VITE_API_ENDPOINT=https://xxxxxxxxxx.execute-api.us-west-1.amazonaws.com/prod
```
> **Nota de Resiliencia**: Si estas variables no se configuran o permanecen vacías, HealthNet se inicia automáticamente en **Modo Demostración Local**, permitiendo probar la totalidad de la interfaz con datos simulados y persistencia en `localStorage`.

### 4.4. Ejecución en Modo Desarrollo
Inicie el servidor de desarrollo Vite con Hot Module Replacement (HMR):
```bash
npm run dev
```
Abra en su navegador la URL indicada en la consola: **`http://localhost:5173/`**

### 4.5. Credenciales de Prueba en Modo Demostración
Para iniciar sesión en modo local / demo:
* **Administrador**: `admin@healthnet.com` / `admin123`
* **Doctor**: `doctor@healthnet.com` / `doctor123`
* **Enfermero**: `enfermero@healthnet.com` / `nurse123`

### 4.6. Ejecución de Pruebas Automatizadas
Para verificar la integridad del código, cálculos de KPIs, validación telefónica y prevención de conflictos de turnos:
```bash
npm test -- --run
```

### 4.7. Compilación para Producción
Para compilar y optimizar la aplicación (validación de tipado TypeScript y empaquetado con Vite):
```bash
npm run build
```
Los archivos finales se ubicarán en la carpeta `dist/`.

---

## 5. ESTRUCTURA DE LA DOCUMENTACIÓN TÉCNICA

Para consultar detalles específicos de la arquitectura, módulos, seguridad y pruebas, diríjase a los documentos especializados disponibles en esta carpeta:

| Documento | Enlace | Contenido Principal |
| :--- | :--- | :--- |
| **Documentación Técnica General** | [DOCUMENTACION_TECNICA.md](./DOCUMENTACION_TECNICA.md) | Arquitectura del sistema, comunicación cliente-servidor, esquema de base de datos relacional PostgreSQL, endpoints REST e integración AWS. |
| **Módulos y Funcionalidades** | [MODULOS_Y_FUNCIONALIDADES.md](./MODULOS_Y_FUNCIONALIDADES.md) | Detalle de los 7 módulos funcionales, capacidades operativas y permisos específicos por rol (Admin, Doctor, Enfermero). |
| **Seguridad Web y Protección de Datos** | [SEGURIDAD_WEB.md](./SEGURIDAD_WEB.md) | Mecanismos de autenticación JWT, RBAC, guardianes de rutas, confirmación de logout, validación E.164 y recomendaciones. |
| **Pruebas, Limitaciones y Mejoras** | [PRUEBAS_Y_MEJORAS.md](./PRUEBAS_Y_MEJORAS.md) | Cobertura de pruebas unitarias Vitest, estado de implementación (implementado vs pendiente) y plan de trabajo futuro. |
