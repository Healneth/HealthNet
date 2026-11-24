# MÓDULOS Y FUNCIONALIDADES DE HEALTHNET
**Guía Detallada de Módulos, Procesos Asistenciales y Matriz de Permisos por Rol**  
*Versión:* 1.0.0  
*Fecha:* Noviembre 2026  

---

## 1. MATRIZ GENERAL DE ROLES Y CONTROL DE ACCESO (RBAC)

HealthNet fundamenta su operación en una segregación estricta de tareas clínicas, asistenciales y administrativas basada en tres roles:
* **Administrador (`admin`)**: Dirección operativa, recursos humanos, inventario de hardware y auditoría institucional.
* **Doctor / Médico (`doctor`)**: Responsable clínico, diagnóstico, calibración de umbrales médicos y emisión de informes.
* **Enfermero (`nurse`)**: Personal de atención directa, receptor de alertas en turno activo, ejecutor de cuidados y relator de la bitácora.

### 1.1. Tabla Comparativa de Acceso a Módulos

| Módulo del Sistema | Ruta Web | Administrador | Doctor | Enfermero |
| :--- | :---: | :---: | :---: | :---: |
| **Inicio de Sesión y Autenticación** | `/login` | ✅ Acceso Total | ✅ Acceso Total | ✅ Acceso Total |
| **Dashboard Administrativo** | `/dashboard` | ✅ Acceso Exclusivo | ❌ Bloqueado | ❌ Bloqueado |
| **Dashboard Clínico / Asistencial** | `/dashboard` | ❌ Bloqueado | ✅ Acceso Total | ✅ Acceso Total |
| **Monitoreo Clínico en Vivo** | `/monitoring` | ✅ Consulta Global | ✅ Consulta Global | ✅ Consulta Global |
| **Reporte Clínico en PDF** | `/monitoring` | ❌ Bloqueado | ✅ Emisión Exclusiva | ❌ Bloqueado |
| **Gestión y Seguimiento de Tickets** | `/alerts` | 👁️ Solo Lectura | 👁️ Solo Lectura | ✍️ Atención y Resolución |
| **Pacientes y Brazaletes (Expediente)**| `/profile` | ✍️ Control Total | 👁️ Lectura / ✍️ Umbrales | 👁️ Solo Lectura |
| **Padrón de Usuarios del Personal** | `/users` | ✍️ Gestión Total | ❌ Bloqueado | ❌ Bloqueado |
| **Programación Semanal de Turnos** | `/users` | ✍️ Planificación Total| ❌ Bloqueado | 👁️ Solo Turno Propio |
| **Asignación Territorial de Pacientes** | `/users` | ✍️ Asignación Total | ✍️ Asignación Total | ❌ Bloqueado |
| **Simulador IoT de Telemetría** | `/simulator` | ✅ Acceso Exclusivo | 🚫 Prohibido (HTTP 403)| 🚫 Prohibido (HTTP 403)|

---

## 2. DESCRIPCIÓN DETALLADA DE MÓDULOS

---

### MÓDULO 1: INICIO DE SESIÓN, AUTENTICACIÓN Y SESIÓN (`/login`)

#### 1. Propósito y Funcionamiento
Garantizar la identificación positiva del personal antes de acceder a la información de salud protegida (PHI).
* **Autenticación en la Nube**: Valida credenciales contra Amazon Cognito User Pools (`signIn`), recibiendo tokens criptográficos JWT (*IdToken* y *AccessToken*).
* **Modo Demostración / Contingencia Local**: Si la aplicación se ejecuta sin variables de AWS, conmuta a validación de credenciales locales preconfiguradas con persistencia en `localStorage`.
* **Verificación de Cuentas Suspendidas**: Antes de iniciar la sesión, el sistema evalúa el atributo `is_active`. Si la cuenta fue suspendida administrativamente, se deniega el acceso con una alerta descriptiva.

#### 2. Confirmación Obligatoria al Cerrar Sesión
Al hacer clic en cualquier control de "Cerrar sesión" en la barra lateral o cabecera, se intercepta la acción desplegando el componente `LogoutConfirmModal.tsx`:
* **Mensaje**: *"¿Estás seguro de que deseas cerrar sesión y abandonar el sitio?"*.
* **Opciones**:
  * **Cancelar**: Cierra el diálogo y mantiene al usuario en la pantalla actual con su sesión activa.
  * **Cerrar sesión**: Ejecuta la función `signOut()`, elimina las credenciales en memoria y redirige a `/login`.
* **Alcance**: Aplica idénticamente para los tres roles (`admin`, `doctor`, `nurse`).

#### 3. Permisos y Restricciones por Rol
* **Todos los Roles**: Tienen permitido autenticarse, cambiar su contraseña mediante el modal `ChangePasswordModal.tsx` y confirmar el cierre de su sesión.

---

### MÓDULO 2: DASHBOARD CENTRAL (`/dashboard`)

#### 1. Propósito y Funcionamiento
Ofrece un centro de control reactivo adaptado al perfil del usuario. Detecta anomalías en tiempo real y ofrece accesos directos hacia las áreas críticas.

#### 2. Funcionalidades según Rol
##### A. Vista del Administrador (Dashboard Estratégico)
* **KPIs Directivos**:
  * Total de pacientes residentes activos en las instalaciones.
  * Ocupación de camas y habitaciones por piso.
  * Enfermeros en servicio distribuidos por turno activo (Matutino, Vespertino, Nocturno).
  * Porcentaje de cobertura de pacientes asignados a personal de enfermería.
* **Gráfica de Distribución de Enfermeros por Turno**: Segmentación visual diferenciada por colores contrastantes para turnos matutino, vespertino y nocturno con tooltips informativos.
* **Diseño Optimizado**: Adaptado a resolución de referencia de 1920×1080 píxeles al 100% de zoom, impidiendo elementos comprimidos o gráficos reducidos.

##### B. Vista del Doctor y Enfermero (Dashboard Clínico)
* **KPIs Clínicos de Urgencia**:
  * Pacientes en estado crítico (frecuencia cardíaca o temperatura fuera de umbral).
  * Alertas pendientes de atención inmediata.
  * Total de caídas detectadas en la jornada.
  * Promedio de constantes vitales del piso activo.
* **Tarjetas Reactivas de Pacientes (`DeviceCard.tsx`)**:
  * Estado visual con código de colores según criticidad (Verde = Estable, Amarillo = Precaución, Rojo = Crítico).
  * Pulsador de acceso directo para consultar el expediente o abrir el monitoreo individual.
* **Redirección Contextual con Filtrado Automático**:
  * Al pulsar el KPI **Alertas Pendientes**, el sistema redirige automáticamente a `/alerts` con el filtro preseleccionado `status=pendientes`.
  * Al pulsar el KPI **Caídas Detectadas**, redirige automáticamente a `/alerts` con el filtro `type=fall`.

---

### MÓDULO 3: MONITOREO CLÍNICO (`/monitoring`)

#### 1. Propósito y Funcionamiento
Supervisión continua de las constantes vitales de los residentes. Permite explorar el padrón general o enfocarse en el análisis biométrico individual de un paciente.

#### 2. Funcionalidades y Componentes
* **Directorio Institucional Tabular**:
  * Tabla con información de paciente, edad, brazalete IoT asignado, ubicación física (piso/cama), enfermero responsable, pulso, temperatura y estado de conexión.
  * **Paginación Integrada (`TablePagination.tsx`)**: Bloques de 10, 30, 50 o 100 pacientes por página con cálculo automático de rangos y reinicio a página 1 al filtrar.
  * Filtros combinados por término de búsqueda, género (Todos, Hombres, Mujeres), piso y conmutador para mostrar únicamente pacientes con alertas activas.
* **Vista Detallada de Constantes Vitales**:
  * Gráfica de pulso cardíaco en vivo (`HeartRateChart.tsx`) con visualización de curva EKG.
  * Gráfica de temperatura en vivo (`TempChart.tsx`) con trazado térmico continuo.
* **Regla de Integridad de Datos (Regla de Oro)**:
  * Si el paciente tiene asignado un brazalete real debidamente registrado en el sistema clínico, los datos que se presentan provienen estrictamente de la base de datos o de los paquetes MQTT recibidos de AWS IoT Core, **sin alteración ni generación de valores ficticios**.
  * Únicamente en el caso de brazaletes generados en el simulador local se admiten mediciones sintéticas de demostración.
* **Generación de Reporte Clínico en PDF**:
  * Plantilla oculta institucional (`DeviceReportTemplate.tsx`) renderizada con membrete, logotipo y datos del paciente.
  * Exportación en alta resolución utilizando `html2canvas` y `jsPDF`.

#### 3. Permisos y Restricciones por Rol
* **Administrador**: Puede consultar el directorio y constantes vitales; **no tiene habilitada** la emisión de reportes clínicos diagnósticos en PDF.
* **Doctor**: Acceso total al monitoreo y **emisión exclusiva** de reportes clínicos en PDF.
* **Enfermero**: Acceso total al monitoreo de pacientes para supervisión en tiempo real; no emite reportes diagnósticos en PDF.

---

### MÓDULO 4: GESTIÓN Y SEGUIMIENTO DE TICKETS CLÍNICOS (`/alerts`)

#### 1. Propósito y Funcionamiento
Constituye el núcleo de responsabilidad asistencial de HealthNet. Cada anomalía fisiológica, detección de caída o pulsación de emergencia se convierte en un ticket formal con trazabilidad completa.

#### 2. Ciclo de Vida del Ticket
1. **Generación**: Se asigna un Folio Único correlativo (`TCK-XXXXXXXX`) y se registra con estado inicial `recibido`.
2. **Asignación Automática**: El motor cruza la ubicación del paciente con la matriz de turnos semanales; el ticket se adjudica al enfermero de guardia en ese piso y turno. Si no existe guardia registrada, se etiqueta como `⚠️ Sin Asignar`.
3. **Atención**: El enfermero asignado cambia el estado a `en_progreso`.
4. **Resolución / Cierre**: Para pasar al estado `completado`, el sistema exige la redacción obligatoria de una nota de atención detallando las acciones clínicas realizadas.
5. **Transferencia de Turno**: Si el ticket no puede ser resuelto dentro del horario de guardia, el enfermero ejecuta una entrega formal seleccionando al enfermero receptor del siguiente turno y justificando el motivo del traspaso.

#### 3. Paginación y Filtrado Multicriterio
* Selector de registros por página: **10, 30, 50 o 100 tickets**.
* Botones de navegación: `← Anterior | Página X de Y | Siguiente →`.
* Muestra el rango actual: *"Mostrando 1 - 10 de 48 tickets clínicos"*.
* **Reinicio Automático**: Cualquier modificación en los filtros de búsqueda, estado, criticidad, turno o enfermero reinicia la paginación a la **página 1**, evitando registros huérfanos o pantallas vacías.

#### 4. Permisos y Restricciones por Rol
* **Administrador y Doctor**: Tienen acceso completo a la lectura, filtrado y auditoría de todos los tickets; **tienen estrictamente bloqueados** los controles para atender, añadir notas de cuidado, transferir o completar tickets (funciones asistenciales reservadas a enfermería).
* **Enfermero**: Es el **único rol autorizado** para atender tickets, registrar notas en la bitácora inmutable, completar incidentes y transferir guardias.

---

### MÓDULO 5: PACIENTES Y BRAZALETES (`/profile`)

#### 1. Propósito y Funcionamiento
Administración integral del expediente de los adultos mayores residentes y vinculación con los brazaletes físicos ESP32.

#### 2. Capacidades Principales
* **Pestañas Separadas**:
  * **Pacientes Activos**: Residentes bajo supervisión diaria.
  * **Pacientes Archivados**: Expedientes históricos que ya no se encuentran activos en el centro.
* **Principio de Preservación Histórica (Sin Borrado Destructivo)**:
  * Se eliminó el borrado físico de la base de datos (`DELETE FROM patients`).
  * En su lugar, se implementó el **Archivado Clínico** (`is_archived = TRUE`), almacenando fecha, usuario responsable y causa del archivo.
  * En el expediente del paciente archivado se puede consultar el historial acumulado de telemetría y caídas, impidiendo alteraciones a sus datos clínicos.
* **Vinculación de Brazaletes IoT**:
  * Permite enlazar o desvincular un código de brazalete (`device_id`). El brazalete desvinculado regresa a estado `DISPONIBLE` para ser asignado a otro residente sin que el paciente anterior pierda sus lecturas históricas.

#### 3. Permisos y Restricciones por Rol
* **Administrador**: Control total sobre datos personales, contacto de emergencia, ubicación física (habitación/piso), vinculación de brazaletes, y archivado o reactivación de pacientes. **No puede modificar** umbrales clínicos de alerta.
* **Doctor**: **Acceso exclusivo** para modificar umbrales clínicos (`hr_min`, `hr_max`, `temp_max`, notas médicas). Todos los campos personales, somatométricos y de ubicación están bloqueados en modo solo lectura (`readOnly`). **No puede archivar ni reactivar** pacientes.
* **Enfermero**: Acceso en modo consulta global del expediente. Puede actualizar somatometría básica (peso y estatura) cuando cuente con autorización asistencial.

---

### MÓDULO 6: GESTIÓN DE USUARIOS, HORARIOS Y MATRIZ DE TURNOS (`/users`)

#### 1. Propósito y Funcionamiento
Control administrativo del talento humano, programación semanal de guardias de enfermería y distribución territorial de pacientes.

#### 2. Pestañas Funcionales
1. **Pestaña 1: Padrón de Usuarios**:
   * Directorio del personal con paginación (10, 30, 50, 100), visualización de rol, turno habitual, teléfono de alertas y estado de cuenta.
   * **Suspensión Administrativa**: El Administrador puede suspender el acceso de una cuenta con un clic, registrando el motivo. La cuenta suspendida es rechazada de inmediato al intentar autenticarse o enviar peticiones a la API.
   * Restablecimiento de contraseña: El Administrador puede emitir solicitudes de restablecimiento de claves vía Cognito / SES.
2. **Pestaña 2: Programación Semanal de Turnos**:
   * Navegación por semanas (semana previa, actual y siguiente) con selector de fecha.
   * Asignación de enfermeros a turnos institucionales (`matutino`, `vespertino`, `nocturno`).
   * **Detección Automática de Conflictos**: El motor (`shiftService.ts`) detecta y bloquea asignaciones solapadas si un enfermero ya fue programado en otro turno en la misma jornada.
3. **Pestaña 3: Asignación Territorial de Pacientes**:
   * Distribución de pacientes a enfermeros responsables según piso y habitación.
   * Soporta **hasta 3 enfermeros asignados por paciente** (uno para el turno matutino, uno para el vespertino y uno para el nocturno), garantizando cobertura 24/7.

#### 3. Permisos y Restricciones por Rol
* **Administrador**: Gestión total de usuarios, suspensión de cuentas, configuración horaria del centro, programación semanal y asignación de pacientes.
* **Doctor**: No tiene acceso a la gestión de usuarios ni a la programación de turnos de enfermeros; puede consultar las asignaciones de pacientes por piso.
* **Enfermero**: Solo puede consultar la programación de su propio turno de trabajo semanal; no puede modificar usuarios, turnos ni asignaciones territoriales.

---

### MÓDULO 7: SIMULADOR IOT (`/simulator`)

#### 1. Propósito y Funcionamiento
Consola de ingeniería diseñada para emitir telemetría sintética, simular variaciones de signos vitales, forzar la detección de caídas o simular el disparo del pulsador de emergencia PBS-33B. Su propósito es validar el comportamiento de las alertas y la capacidad de respuesta del sistema sin requerir la presencia de pacientes o hardware físico en pruebas.

#### 2. Restricción Estricta de Acceso y Medidas de Protección
Por mandato de seguridad operativa, **los usuarios con rol de Doctor o Enfermero tienen estrictamente prohibido el acceso a este módulo**.

Medidas de protección implementadas en tres niveles:
1. **Capa Visual (Navegación)**:
   * El enlace al Simulador está completamente oculto en la barra lateral ([Sidebar.tsx](file:///c:/Users/DELL/Desktop/leli/Uni/Huevo%20revuelto/Popochitos/HealthNet/src/components/Sidebar.tsx)) y en la barra superior ([Navbar.tsx](file:///c:/Users/DELL/Desktop/leli/Uni/Huevo%20revuelto/Popochitos/HealthNet/src/components/Navbar.tsx)) para cualquier usuario que no sea Administrador.
2. **Capa Enrutador Frontend (React Router)**:
   * La ruta protegida `/simulator` en [App.tsx](file:///c:/Users/DELL/Desktop/leli/Uni/Huevo%20revuelto/Popochitos/HealthNet/src/App.tsx) tiene la regla `allowedRoles={['admin']}`.
   * El componente [SimulatorPage.tsx](file:///c:/Users/DELL/Desktop/leli/Uni/Huevo%20revuelto/Popochitos/HealthNet/src/pages/SimulatorPage.tsx) incluye un guardián en tiempo de montaje: si el rol no es `admin`, ejecuta inmediatamente `<Navigate to="/dashboard" replace />`.
3. **Capa Backend (AWS Lambda)**:
   * En [aws/lambdas/patients-api/index.js](file:///c:/Users/DELL/Desktop/leli/Uni/Huevo%20revuelto/Popochitos/HealthNet/aws/lambdas/patients-api/index.js), cualquier solicitud dirigida a endpoints que comiencen con `/simulator` verifica el claim de identidad del solicitante: si no es `admin`, retorna un código de estado **HTTP 403 Forbidden** con el mensaje descriptivo de acceso denegado.
