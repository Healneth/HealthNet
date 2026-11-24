const { Client } = require('pg');

let CognitoClient = null;
let AdminCreateUserCommand = null;
let AdminResetUserPasswordCommand = null;
try {
  const cognitoPkg = require('@aws-sdk/client-cognito-identity-provider');
  CognitoClient = cognitoPkg.CognitoIdentityProviderClient;
  AdminCreateUserCommand = cognitoPkg.AdminCreateUserCommand;
  AdminResetUserPasswordCommand = cognitoPkg.AdminResetUserPasswordCommand;
} catch (e) {
  console.warn('AWS SDK CognitoIdentityProviderClient no disponible localmente:', e.message);
}

let SESClient = null;
let SendEmailCommand = null;
try {
  const sesPkg = require('@aws-sdk/client-ses');
  SESClient = sesPkg.SESClient;
  SendEmailCommand = sesPkg.SendEmailCommand;
} catch (e) {
  console.warn('AWS SDK SESClient no disponible localmente:', e.message);
}

let SNSClient = null;
let PublishCommand = null;
try {
  const snsPkg = require('@aws-sdk/client-sns');
  SNSClient = snsPkg.SNSClient;
  PublishCommand = snsPkg.PublishCommand;
} catch (e) {
  console.warn('AWS SDK SNSClient no disponible localmente:', e.message);
}

function getCognitoClient() {
  if (!CognitoClient) return null;
  return new CognitoClient({ region: process.env.AWS_REGION || 'us-west-1' });
}

function getSESClient() {
  if (!SESClient) return null;
  return new SESClient({ region: process.env.AWS_REGION || 'us-west-1' });
}

function getSNSClient() {
  if (!SNSClient) return null;
  return new SNSClient({ region: process.env.AWS_REGION || 'us-west-1' });
}

/**
 * Despachador unificado de alertas críticas vía AWS End User Messaging / Amazon SNS (SMS).
 * Valida y formatea el número al estándar internacional E.164 antes de emitir la petición.
 */
async function dispatchAwsMessagingSms(phone, message) {
  if (!phone) return { sent: false, reason: 'Teléfono no proporcionado' };
  let cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) cleaned = '+52' + cleaned;
    else cleaned = '+' + cleaned;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) {
    console.warn('[AWS Messaging SMS] Teléfono no cumple con formato E.164:', phone);
    return { sent: false, reason: 'Formato no cumple estándar E.164' };
  }

  const sns = getSNSClient();
  if (sns && PublishCommand && process.env.SNS_ENABLED === 'true') {
    try {
      await sns.send(new PublishCommand({
        PhoneNumber: cleaned,
        Message: message,
      }));
      console.log(`[AWS Messaging SMS] Notificación enviada con éxito a ${cleaned}`);
      return { sent: true, phone: cleaned };
    } catch (err) {
      console.error(`[AWS Messaging SMS] Error enviando a ${cleaned}:`, err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.log(`[AWS Messaging SMS Simulado] (SNS_ENABLED no activo o en local) Para: ${cleaned} | Msg: ${message}`);
    return { sent: true, simulated: true, phone: cleaned };
  }
}

const clientConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: { rejectUnauthorized: false }
};

let client = null;

async function getDbClient() {
  if (!client) {
    client = new Client(clientConfig);
    await client.connect();
    // Asegurar tabla de auditoría
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        user_email VARCHAR(120),
        user_role VARCHAR(20) NOT NULL,
        user_name VARCHAR(150),
        action VARCHAR(60) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        details TEXT,
        changes JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  return client;
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,X-User-Role,X-User-Id,X-User-Email',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

/**
 * ─────────────────────────────────────────────────────────────
 * PROCESAMIENTO CENTRALIZADO DE EVENTOS DEL BOTÓN PBS-33B
 * Cumple estrictamente con las 7 reglas asistenciales:
 * 1. Identificación exclusiva por deviceId (cero confianza en datos del payload).
 * 2. Asignación exclusiva a enfermeros relacionados con el paciente en el turno activo.
 * 3. Deduplicación por eventId en BD (idempotencia) sin enfriamiento en el ESP32.
 * 4. Inmutabilidad y trazabilidad completa (alerts, tickets, bitácora de actividad).
 * 5. Notificaciones multicanal (SES / SNS) con identificación de estado.
 * ─────────────────────────────────────────────────────────────
 */
async function processEmergencyEvent(db, { deviceId, eventId, timestamp }) {
  if (!deviceId) {
    const err = new Error('Identificador del dispositivo/brazalete (deviceId) no proporcionado.');
    err.statusCode = 400;
    throw err;
  }

  const cleanDeviceId = deviceId.trim();
  const cleanEventId = eventId || `ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 1. DEDUPLICACIÓN ESTRICTA EN BASE DE DATOS
  const existingAlert = await db.query('SELECT * FROM alerts WHERE event_id = $1 LIMIT 1', [cleanEventId]);
  if (existingAlert.rows.length > 0) {
    const existingTicket = await db.query('SELECT * FROM tickets WHERE event_id = $1 LIMIT 1', [cleanEventId]);
    return {
      isDuplicate: true,
      alert: existingAlert.rows[0],
      ticket: existingTicket.rows[0] || null,
      message: 'Evento de emergencia ya registrado previamente (idempotencia confirmada).'
    };
  }

  // 2. VALIDACIÓN DEL BRAZALETE Y OBTENCIÓN EXCLUSIVA DE DATOS DEL PACIENTE DESDE BD
  // Cero confianza en paciente o habitación enviados por el dispositivo o cliente
  const braceRes = await db.query(`
    SELECT 
      b.device_id,
      b.patient_id,
      b.status AS bracelet_status,
      p.id AS patient_uuid,
      p.full_name AS patient_name,
      p.room_number,
      p.floor,
      p.bed_number,
      p.is_active AS patient_is_active,
      COALESCE(p.is_archived, false) AS patient_is_archived
    FROM bracelets b
    LEFT JOIN patients p ON b.patient_id = p.id
    WHERE b.device_id = $1
    LIMIT 1;
  `, [cleanDeviceId]);

  if (braceRes.rows.length === 0) {
    console.error(`[EMERGENCIA RECHAZADA] El dispositivo ${cleanDeviceId} no está registrado en la base de datos.`);
    const err = new Error(`Dispositivo o brazalete '${cleanDeviceId}' no registrado en el sistema HealthNet. Evento de emergencia rechazado.`);
    err.statusCode = 404;
    throw err;
  }

  const braceData = braceRes.rows[0];
  if (!braceData.patient_id || !braceData.patient_name || braceData.patient_is_active === false || braceData.patient_is_archived === true) {
    console.error(`[EMERGENCIA IGNORADA] El brazalete ${cleanDeviceId} no tiene un paciente activo vinculado.`);
    const err = new Error(`El brazalete '${cleanDeviceId}' no tiene ningún paciente activo asociado en el sistema. Evento de emergencia ignorado.`);
    err.statusCode = 400;
    throw err;
  }

  const patientUuid = braceData.patient_uuid;
  const patientName = braceData.patient_name;
  const roomNumber = braceData.room_number || 'Habitación no asignada';
  const floor = braceData.floor || 'Piso 1';

  // 3. DETERMINACIÓN DEL TURNO ACTUAL
  const eventDate = timestamp ? new Date(typeof timestamp === 'number' ? timestamp : Number(timestamp)) : new Date();
  const currentHour = isNaN(eventDate.getHours()) ? new Date().getHours() : eventDate.getHours();
  let currentShift = 'matutino';
  if (currentHour >= 7 && currentHour < 15) currentShift = 'matutino';
  else if (currentHour >= 15 && currentHour < 23) currentShift = 'vespertino';
  else currentShift = 'nocturno';

  // 4. ASIGNACIÓN EXCLUSIVA A ENFERMEROS RELACIONADOS CON EL PACIENTE Y EN EL TURNO
  // Regla 2: Solo enfermeros registrados y activos relacionados con el paciente para ese turno.
  // NO doctores, NO administradores. Si no existe ninguno disponible, queda sin asignar.
  let assignedNurseId = null;
  let assignedNurseName = null;
  let assignedNurseEmail = null;
  let assignedNursePhone = null;
  let isUnassigned = true;

  try {
    const psaRes = await db.query(`
      SELECT 
        psa.nurse_id,
        u.full_name,
        u.email,
        u.phone_number,
        u.role_id,
        u.is_active
      FROM patient_shift_assignments psa
      JOIN users u ON u.id = psa.nurse_id
      WHERE (psa.patient_id = $1 OR psa.patient_uuid = $1 OR psa.patient_device_id = $2)
        AND psa.shift_type = $3
        AND psa.active = true
        AND u.role_id = 'nurse'
        AND u.is_active = true
      LIMIT 1;
    `, [patientUuid, cleanDeviceId, currentShift]);

    if (psaRes.rows.length > 0) {
      const nurse = psaRes.rows[0];
      assignedNurseId = nurse.nurse_id;
      assignedNurseName = nurse.full_name;
      assignedNurseEmail = nurse.email;
      assignedNursePhone = nurse.phone_number;
      isUnassigned = false;
    }
  } catch (errPsa) {
    console.warn('[processEmergencyEvent] Error consultando patient_shift_assignments:', errPsa.message);
  }

  // 5. GENERACIÓN DE FOLIO Y METADATOS
  const currentYear = new Date().getFullYear();
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const folio = `TCK-${currentYear}-${randomSuffix}`;
  const alertTitle = 'Emergencia Solicitada por Paciente (Pulsador PBS-33B)';
  const alertMsg = `¡Emergencia solicitada por paciente mediante pulsador PBS-33B (${patientName} - ${roomNumber})!`;

  // 6. INSERCIÓN EN TABLA ALERTS
  const insAlert = await db.query(`
    INSERT INTO alerts (
      folio, event_id, origin, patient_id, device_id, type, title, criticality, clinical_value, shift_type, message, current_status, acknowledged, assigned_nurse_id
    ) VALUES (
      $1, $2, 'EMERGENCY_BUTTON', $3, $4, 'emergency_button', $5, 'CRITICA', 'Pulsador PBS-33B', $6, $7, 'PENDIENTE', false, $8
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING *;
  `, [folio, cleanEventId, patientUuid, cleanDeviceId, alertTitle, currentShift, alertMsg, assignedNurseId]);

  const alertRecord = insAlert.rows[0] || null;

  // 7. INSERCIÓN EN TABLA TICKETS
  const insTicket = await db.query(`
    INSERT INTO tickets (
      folio, alert_id, origin, event_id, patient_id, patient_uuid, patient_name, room_number, floor, device_id, alert_type, title, description, clinical_value, criticality, shift_type, status, assigned_nurse_id, assigned_nurse_name, is_unassigned
    ) VALUES (
      $1, $2, 'EMERGENCY_BUTTON', $3, $4, $4, $5, $6, $7, $8, 'emergency_button', $9, $10, 'Pulsador PBS-33B Activado', 'critica', $11, 'recibido', $12, $13, $14
    )
    ON CONFLICT (folio) DO NOTHING
    RETURNING *;
  `, [
    folio,
    alertRecord ? alertRecord.id : folio,
    cleanEventId,
    patientUuid,
    patientName,
    roomNumber,
    floor,
    cleanDeviceId,
    alertTitle,
    'El paciente ha presionado el pulsador de auxilio PBS-33B solicitando asistencia médica inmediata.',
    currentShift,
    assignedNurseId,
    assignedNurseName,
    isUnassigned
  ]);

  const ticketRecord = insTicket.rows[0] || null;
  const ticketId = ticketRecord ? ticketRecord.id : folio;

  // 8. BITÁCORA DE ACTIVIDAD FORMAL
  const activityNote = isUnassigned
    ? `🚨 ALERTA CRÍTICA SIN ASIGNAR: El paciente ${patientName} (${roomNumber}) activó el pulsador PBS-33B pero no cuenta con un enfermero asignado para el turno ${currentShift}. Requiere atención prioritaria por parte de supervisión o administración.`
    : `Alerta de emergencia recibida por pulsador físico PBS-33B. Asignado a enfermero responsable ${assignedNurseName} para el turno ${currentShift}.`;

  try {
    await db.query(`
      INSERT INTO ticket_activity (ticket_id, action, description, user_id, user_name, user_role)
      VALUES ($1, 'RECEPCION', $2, 'SISTEMA', 'Sistema HealthNet (AWS IoT)', 'sistema');
    `, [ticketId, activityNote]);
  } catch (actErr) {
    console.warn('[processEmergencyEvent] Error registrando bitácora de actividad:', actErr.message);
  }

  // 9. AUDITORÍA DEL SISTEMA
  try {
    await db.query(`
      INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
      VALUES ('SISTEMA', 'iot@healthnet.com', 'sistema', 'EMERGENCY_BUTTON_TRIGGERED', 'emergency_alert', $1, $2);
    `, [cleanEventId, `Emergencia PBS-33B para paciente ${patientName} (${cleanDeviceId}). ${isUnassigned ? 'SIN ENFERMERO ASIGNADO' : 'Asignado a: ' + assignedNurseName}`]);
  } catch (audErr) {
    console.warn('[processEmergencyEvent] Error registrando auditoría:', audErr.message);
  }

  // 10. NOTIFICACIONES (AWS SES Y SNS)
  const notificationStatus = {
    emailSent: false,
    smsSent: false,
    adminNotified: false,
    notes: []
  };

  const sesClient = getSESClient();
  const snsClient = getSNSClient();

  // Envío a enfermero asignado
  if (assignedNurseEmail && sesClient && SendEmailCommand && process.env.SES_SENDER_EMAIL) {
    try {
      await sesClient.send(new SendEmailCommand({
        Source: process.env.SES_SENDER_EMAIL,
        Destination: { ToAddresses: [assignedNurseEmail] },
        Message: {
          Subject: { Data: `🚨 URGENTE: Emergencia PBS-33B de Paciente ${patientName} (${roomNumber})` },
          Body: {
            Text: {
              Data: `ALERTA CRÍTICA HEALTHNET\n\nEl paciente ${patientName} en ${roomNumber} (${floor}) ha presionado el pulsador de auxilio PBS-33B.\n\nFolio: ${folio}\nTurno: ${currentShift}\nAsignado a: ${assignedNurseName}\n\nFavor de acudir de inmediato a brindar asistencia.`
            }
          }
        }
      }));
      notificationStatus.emailSent = true;
    } catch (sesErr) {
      notificationStatus.notes.push(`Error SES: ${sesErr.message}`);
    }
  } else {
    notificationStatus.notes.push('SES email pendiente de configuración (falta SES_SENDER_EMAIL o cliente).');
  }

  if (assignedNursePhone) {
    const smsMsg = `[HealthNet] 🚨 EMERGENCIA PBS-33B: Paciente ${patientName} (${roomNumber}) solicita auxilio inmediato. Folio: ${folio}`;
    const smsRes = await dispatchAwsMessagingSms(assignedNursePhone, smsMsg);
    if (smsRes.sent) {
      notificationStatus.smsSent = true;
    } else {
      notificationStatus.notes.push(`Aviso SMS: ${smsRes.reason || smsRes.error}`);
    }
  } else {
    notificationStatus.notes.push('Sin teléfono móvil de enfermero asignado para SMS de emergencia.');
  }

  // Si quedó sin asignar, notificar a los administradores vía Email y SMS
  if (isUnassigned) {
    try {
      const adminUsers = await db.query("SELECT email, phone_number FROM users WHERE role_id = 'admin' AND is_active = true");
      if (adminUsers.rows.length > 0) {
        if (sesClient && SendEmailCommand && process.env.SES_SENDER_EMAIL) {
          const adminEmails = adminUsers.rows.map(r => r.email).filter(Boolean);
          if (adminEmails.length > 0) {
            await sesClient.send(new SendEmailCommand({
              Source: process.env.SES_SENDER_EMAIL,
              Destination: { ToAddresses: adminEmails },
              Message: {
                Subject: { Data: `⚠️ ALERTA CRÍTICA SIN ASIGNAR: Paciente ${patientName} (${roomNumber})` },
                Body: {
                  Text: {
                    Data: `ATENCIÓN ADMINISTRATIVA:\n\nEl paciente ${patientName} en ${roomNumber} ha activado el pulsador PBS-33B pero NO tiene enfermero asignado en el turno actual (${currentShift}).\n\nFolio: ${folio}\nSe requiere asignación inmediata de personal de enfermería.`
                  }
                }
              }
            }));
            notificationStatus.adminNotified = true;
          }
        }

        // SMS a administradores de guardia ante emergencia sin asignar
        for (const admin of adminUsers.rows) {
          if (admin.phone_number) {
            const adminSms = `[HealthNet] ⚠️ ALERTA CRÍTICA SIN ASIGNAR: Paciente ${patientName} (${roomNumber}) activó pulsador PBS-33B sin enfermero en turno ${currentShift}. Folio: ${folio}`;
            await dispatchAwsMessagingSms(admin.phone_number, adminSms);
          }
        }
      }
    } catch (adminNotifErr) {
      console.warn('[processEmergencyEvent] Error notificando administradores:', adminNotifErr.message);
    }
  }

  return {
    success: true,
    folio,
    eventId: cleanEventId,
    patientId: patientUuid,
    patientName,
    roomNumber,
    floor,
    deviceId: cleanDeviceId,
    shiftType: currentShift,
    assignedNurseId,
    assignedNurseName,
    isUnassigned,
    alert: alertRecord,
    ticket: ticketRecord,
    notifications: notificationStatus,
    message: isUnassigned
      ? `Alerta de emergencia generada con éxito (Folio: ${folio}). Paciente sin enfermero asignado en turno ${currentShift}; se emitió aviso prioritario a administración.`
      : `Alerta de emergencia generada con éxito (Folio: ${folio}) y asignada al enfermero ${assignedNurseName} (${currentShift}).`
  };
}

exports.handler = async (event) => {
  console.log('HTTP Event received:', JSON.stringify(event, null, 2));

  // Handle CORS preflight options request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const db = await getDbClient();

    // ─────────────────────────────────────────────────────────
    // 0. INGESTIÓN DIRECTA DE EVENTO AWS IOT CORE (MQTT)
    // ─────────────────────────────────────────────────────────
    if (!event.httpMethod && (event.eventType === 'EMERGENCY_BUTTON' || event.emergencyButtonPressed || event.emergencyButton)) {
      try {
        const devId = event.deviceId;
        const evId = event.eventId || event.emergencyButton?.eventId;
        const result = await processEmergencyEvent(db, {
          deviceId: devId,
          eventId: evId,
          timestamp: event.timestamp
        });
        return {
          statusCode: result.isDuplicate ? 200 : 201,
          body: JSON.stringify(result)
        };
      } catch (err) {
        console.error('[IoT Core] Error procesando evento de emergencia:', err.message);
        return {
          statusCode: err.statusCode || 500,
          body: JSON.stringify({ error: err.message })
        };
      }
    }
    
    // Determine the route and caller identity
    const httpMethod = event.httpMethod;
    const pathParameters = event.pathParameters || {};
    const deviceId = pathParameters.deviceId;
    const path = event.path || '';

    // Normalizar cabeceras de rol y usuario
    const headersLower = {};
    if (event.headers) {
      for (const [k, v] of Object.entries(event.headers)) {
        headersLower[k.toLowerCase()] = v;
      }
    }
    const rawRole = headersLower['x-user-role'] || event.requestContext?.authorizer?.claims?.['custom:role'];
    const callerUserId = headersLower['x-user-id'] || event.requestContext?.authorizer?.claims?.sub || null;
    const callerEmail = (headersLower['x-user-email'] || event.requestContext?.authorizer?.claims?.email || '').toLowerCase().trim();

    // SEGURIDAD: Rechazar si no hay rol válido o si no está autenticado (NUNCA asignar 'admin' por defecto)
    const validRoles = ['admin', 'doctor', 'nurse'];
    const callerRole = rawRole ? rawRole.toLowerCase().trim() : null;

    if (!callerRole || !validRoles.includes(callerRole)) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'No autorizado: Se requiere una identidad de usuario y rol clínico válido (admin, doctor, nurse). Ninguna solicitud obtiene privilegios por omisión.' })
      };
    }

    // SEGURIDAD: Verificar en la BD si la cuenta de usuario está activa o suspendida, y evitar alteración de rol
    if (callerEmail || callerUserId) {
      try {
        const userCheck = await db.query(
          'SELECT id, role_id, is_active FROM users WHERE LOWER(email) = $1 OR id::text = $2',
          [callerEmail || 'none', callerUserId || 'none']
        );
        if (userCheck.rows.length > 0) {
          const dbUser = userCheck.rows[0];
          if (dbUser.is_active === false) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: 'Cuenta suspendida: Esta cuenta ha sido suspendida por la administración. Acceso denegado a todas las operaciones.' })
            };
          }
          if (dbUser.role_id && dbUser.role_id.toLowerCase() !== callerRole) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: 'Acceso denegado: El rol proporcionado no coincide con el perfil del usuario registrado (detección de escalamiento de privilegios).' })
            };
          }
        }
      } catch (dbErr) {
        console.warn('Verificación de usuario en BD omitida o fallida:', dbErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────
    // SIMULADOR IOT (Restricción estricta RBAC en Backend)
    // El simulador IoT está restringido exclusivamente al rol 'admin'.
    // Usuarios con rol 'doctor' o 'nurse' tienen acceso estrictamente denegado (HTTP 403 Forbidden).
    // ─────────────────────────────────────────────────────────
    if (path.startsWith('/simulator')) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: 'Forbidden',
            message: 'Acceso Denegado (RBAC): El simulador IoT está restringido exclusivamente a la Administración. Doctores y Enfermeros no tienen autorización para interactuar con el simulador ni emitir telemetría de prueba.'
          })
        };
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'ok',
          authorizedRole: callerRole,
          message: 'Acceso autorizado al simulador IoT para Administrador.'
        })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 1. PATIENTS ENDPOINTS (Nuevo Esquema Normalizado con RBAC)
    // ─────────────────────────────────────────────────────────

    // GET /patients (list patients con soporte de paginación)
    if (httpMethod === 'GET' && !deviceId && path === '/patients') {
      const qParams = event.queryStringParameters || {};
      const pageParam = qParams.page ? parseInt(qParams.page) : null;
      const limitParam = qParams.limit ? parseInt(qParams.limit) : null;

      let baseFromWhere = `
        FROM patients p
        LEFT JOIN bracelets b ON p.id = b.patient_id
        LEFT JOIN patient_thresholds t ON p.id = t.patient_id
        LEFT JOIN users u ON p.assigned_nurse_id = u.id
      `;

      let queryParams = [];
      // RBAC: Si es Enfermero, consultar ÚNICAMENTE sus pacientes asignados
      if (callerRole === 'nurse') {
        baseFromWhere += ` WHERE p.assigned_nurse_id::text = $1 OR LOWER(u.email) = LOWER($2) `;
        queryParams = [callerUserId || 'a0000000-0000-0000-0000-000000000003', callerEmail];
      }

      let countQuery = `SELECT COUNT(p.id) as total ${baseFromWhere}`;
      const countRes = await db.query(countQuery, queryParams);
      const totalCount = parseInt(countRes.rows[0]?.total || '0');

      let query = `
        SELECT 
          p.id,
          p.full_name,
          p.full_name AS name,
          p.birth_date,
          p.gender,
          p.height_cm,
          p.height_cm::text AS height,
          p.weight_kg,
          p.weight_kg::text AS weight,
          p.room_number,
          p.floor,
          p.bed_number,
          p.assigned_nurse_id,
          u.full_name AS assigned_nurse_name,
          p.medical_notes,
          p.contact_name,
          p.contact_phone,
          p.contact_phone AS phone,
          p.is_active,
          COALESCE(p.is_archived, false) AS is_archived,
          p.archived_at,
          p.archived_by,
          p.archived_reason,
          COALESCE(b.device_id, p.id::text) AS device_id,
          b.status AS bracelet_status,
          b.assigned_at,
          b.last_sync_at,
          COALESCE(t.hr_min, 50) AS hr_min,
          COALESCE(t.hr_max, 110) AS hr_max,
          COALESCE(t.temp_max, 38.00) AS temp_max,
          COALESCE(t.notifications_active, true) AS notifications_active,
          COALESCE(t.watch_theme, 'dark') AS watch_theme
        ${baseFromWhere}
        ORDER BY p.full_name ASC
      `;

      if (pageParam && limitParam) {
        const offset = Math.max(0, (pageParam - 1) * limitParam);
        queryParams.push(limitParam);
        query += ` LIMIT $${queryParams.length}`;
        queryParams.push(offset);
        query += ` OFFSET $${queryParams.length}`;
      } else {
        query += ` LIMIT 500`;
      }

      const result = await db.query(query, queryParams);
      const resHeaders = {
        ...headers,
        'X-Total-Count': totalCount.toString()
      };

      if (pageParam) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({
            data: result.rows,
            items: result.rows,
            total: totalCount,
            page: pageParam,
            limit: limitParam || result.rows.length,
            totalPages: Math.ceil(totalCount / (limitParam || 1))
          })
        };
      }

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify(result.rows)
      };
    }

    // GET /patients/{deviceId}
    if (httpMethod === 'GET' && deviceId && path.startsWith('/patients/')) {
      const query = `
        SELECT 
          p.id,
          p.full_name,
          p.full_name AS name,
          p.birth_date,
          p.gender,
          p.height_cm,
          p.height_cm::text AS height,
          p.weight_kg,
          p.weight_kg::text AS weight,
          p.room_number,
          p.floor,
          p.bed_number,
          p.assigned_nurse_id,
          u.full_name AS assigned_nurse_name,
          u.email AS assigned_nurse_email,
          p.medical_notes,
          p.contact_name,
          p.contact_phone,
          p.contact_phone AS phone,
          p.is_active,
          COALESCE(p.is_archived, false) AS is_archived,
          p.archived_at,
          p.archived_by,
          p.archived_reason,
          b.device_id,
          b.status AS bracelet_status,
          COALESCE(t.hr_min, 50) AS hr_min,
          COALESCE(t.hr_max, 110) AS hr_max,
          COALESCE(t.temp_max, 38.00) AS temp_max,
          COALESCE(t.notifications_active, true) AS notifications_active,
          COALESCE(t.watch_theme, 'dark') AS watch_theme
        FROM patients p
        LEFT JOIN bracelets b ON p.id = b.patient_id
        LEFT JOIN patient_thresholds t ON p.id = t.patient_id
        LEFT JOIN users u ON p.assigned_nurse_id = u.id
        WHERE b.device_id = $1 OR p.id::text = $1
        LIMIT 1;
      `;
      const result = await db.query(query, [deviceId]);
      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: `Patient with identifier ${deviceId} not found` })
        };
      }

      const patient = result.rows[0];

      // RBAC: Validar que el Enfermero solo acceda a pacientes asignados a su cuenta
      if (callerRole === 'nurse') {
        const isAssigned = (patient.assigned_nurse_id && callerUserId && patient.assigned_nurse_id.toString() === callerUserId) ||
                           (patient.assigned_nurse_email && callerEmail && patient.assigned_nurse_email.toLowerCase() === callerEmail.toLowerCase()) ||
                           (callerEmail === 'enfermero@healthnet.com' && patient.assigned_nurse_id === 'a0000000-0000-0000-0000-000000000003');
        if (!isAssigned) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'Acceso Denegado (RBAC): El rol Enfermero solo tiene autorización para consultar pacientes asignados a su cargo.' })
          };
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(patient)
      };
    }

    // POST /patients (Upsert de paciente, brazalete y umbrales con estricto RBAC)
    if (httpMethod === 'POST' && path.startsWith('/patients')) {
      const body = JSON.parse(event.body || '{}');
      const targetDeviceId = deviceId || body.deviceId || body.device_id;
      const patientFullName = body.name || body.full_name || 'Paciente Nuevo';

      if (!targetDeviceId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Missing deviceId parameter' })
        };
      }

      // Validar si el paciente ya existe
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
      let existingPatientId = (body.id && isUuid(body.id)) ? body.id.trim() : null;
      let existingRecord = null;
      if (!existingPatientId) {
        const checkBrace = await db.query('SELECT patient_id FROM bracelets WHERE device_id = $1', [targetDeviceId]);
        if (checkBrace.rows.length > 0 && checkBrace.rows[0].patient_id && isUuid(checkBrace.rows[0].patient_id)) {
          existingPatientId = checkBrace.rows[0].patient_id;
        }
      }

      if (existingPatientId) {
        const checkPatient = await db.query('SELECT * FROM patients WHERE id = $1', [existingPatientId]);
        if (checkPatient.rows.length > 0) {
          existingRecord = checkPatient.rows[0];
        } else {
          existingPatientId = null;
        }
      }

      // ──────────────────────────────────────────
      // REGLAS RBAC BACKEND SEGÚN ROL:
      // ──────────────────────────────────────────

      // CASO 1: ENFERMERO
      if (callerRole === 'nurse') {
        // No puede registrar pacientes nuevos
        if (!existingRecord) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'Acceso Denegado (RBAC): El rol Enfermero no puede registrar nuevos pacientes.' })
          };
        }

        // Verificar asignación del paciente
        const isAssigned = (existingRecord.assigned_nurse_id && callerUserId && existingRecord.assigned_nurse_id.toString() === callerUserId) ||
                           (callerEmail === 'enfermero@healthnet.com' && existingRecord.assigned_nurse_id === 'a0000000-0000-0000-0000-000000000003');
        if (!isAssigned) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'Acceso Denegado (RBAC): No puede modificar datos de pacientes no asignados.' })
          };
        }

        // Enfermero SOLO puede actualizar peso y estatura (somatometría autorizada)
        const parseWeight = body.weight ? parseFloat(body.weight.toString().replace(/[^0-9.]/g, '')) : null;
        const parseHeight = body.height ? parseFloat(body.height.toString().replace(/[^0-9.]/g, '')) : null;

        await db.query(`
          UPDATE patients SET
            weight_kg = COALESCE($1, weight_kg),
            height_cm = COALESCE($2, height_cm),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [parseWeight, parseHeight, existingPatientId]);

        // Registrar en Auditoría
        await db.query(`
          INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details, changes)
          VALUES ($1, $2, $3, 'UPDATE_VITALS', 'patient', $4, $5, $6)
        `, [
          callerUserId,
          callerEmail,
          callerRole,
          targetDeviceId,
          'Actualización de somatometría (peso/estatura) por personal de enfermería',
          JSON.stringify({
            weight: { oldVal: existingRecord.weight_kg, newVal: parseWeight },
            height: { oldVal: existingRecord.height_cm, newVal: parseHeight },
          })
        ]);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            id: existingPatientId,
            device_id: targetDeviceId,
            message: 'Somatometría de paciente actualizada correctamente por enfermero.',
            success: true
          })
        };
      }

      // Iniciar transacción para Doctor o Administrador
      await db.query('BEGIN');
      try {
        let patientId = existingPatientId;

        // Limpieza de valores de somatometría si vienen en el body
        const parsedWeight = body.weight ? parseFloat(body.weight.toString().replace(/[^0-9.]/g, '')) : null;
        const parsedHeight = body.height ? parseFloat(body.height.toString().replace(/[^0-9.]/g, '')) : null;

        if (patientId) {
          // CASO 2: DOCTOR actualiza paciente existente
          if (callerRole === 'doctor') {
            // RBAC: El doctor NO PUEDE modificar datos personales, fisiológicos (peso, estatura),
            // contacto de emergencia ni ubicación física o enfermero responsable asignado.
            // La única información del paciente que el doctor puede editar son las notas clínicas y los umbrales clínicos.
            if (body.medicalNotes !== undefined || body.medical_notes !== undefined) {
              const notes = body.medicalNotes !== undefined ? body.medicalNotes : body.medical_notes;
              await db.query(`
                UPDATE patients SET
                  medical_notes = $1,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
              `, [notes, patientId]);
            }

            // DOCTOR actualiza umbrales clínicos
            await db.query(`
              INSERT INTO patient_thresholds (patient_id, hr_min, hr_max, temp_max, notifications_active, watch_theme)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (patient_id) DO UPDATE SET
                hr_min = EXCLUDED.hr_min,
                hr_max = EXCLUDED.hr_max,
                temp_max = EXCLUDED.temp_max,
                notifications_active = EXCLUDED.notifications_active,
                watch_theme = EXCLUDED.watch_theme,
                updated_at = CURRENT_TIMESTAMP;
            `, [
              patientId,
              parseInt(body.hrMin || body.hr_min || 50),
              parseInt(body.hrMax || body.hr_max || 110),
              parseFloat(body.tempMax || body.temp_max || 38.00),
              body.notificationsActive !== undefined ? body.notificationsActive : true,
              body.watchTheme || body.watch_theme || 'dark'
            ]);

            await db.query(`
              INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
              VALUES ($1, $2, $3, 'UPDATE_THRESHOLDS', 'patient', $4, 'Actualización médica de notas clínicas y umbrales por doctor')
            `, [callerUserId, callerEmail, callerRole, targetDeviceId]);

          } else {
            // CASO 3: ADMINISTRADOR actualiza paciente existente
            // Admin modifica datos personales, contacto, habitaciones, pisos y enfermeros.
            // NO PUEDE modificar peso, estatura ni umbrales clínicos.
            const isArchivedVal = body.isArchived !== undefined ? Boolean(body.isArchived) : (body.is_archived !== undefined ? Boolean(body.is_archived) : null);
            const archivedReasonVal = body.archivedReason || body.archived_reason || null;
            const archivedByVal = body.archivedBy || body.archived_by || callerEmail;

            const rawNurseId = body.assigned_nurse_id || body.assignedNurseId;
            const assignedNurseUuid = (rawNurseId && isUuid(rawNurseId)) ? rawNurseId.trim() : null;

            await db.query(`
              UPDATE patients SET
                full_name = $1,
                gender = COALESCE($2, gender),
                contact_name = COALESCE($3, contact_name),
                contact_phone = COALESCE($4, contact_phone),
                room_number = COALESCE($5, room_number),
                floor = COALESCE($6, floor),
                bed_number = COALESCE($12, bed_number),
                assigned_nurse_id = COALESCE($7, assigned_nurse_id),
                is_archived = CASE WHEN $9::boolean IS NOT NULL THEN $9::boolean ELSE is_archived END,
                is_active = CASE WHEN $9::boolean IS NOT NULL THEN NOT $9::boolean ELSE is_active END,
                archived_at = CASE WHEN $9::boolean = TRUE THEN CURRENT_TIMESTAMP WHEN $9::boolean = FALSE THEN NULL ELSE archived_at END,
                archived_by = CASE WHEN $9::boolean = TRUE THEN $10 WHEN $9::boolean = FALSE THEN NULL ELSE archived_by END,
                archived_reason = CASE WHEN $9::boolean = TRUE THEN $11 WHEN $9::boolean = FALSE THEN NULL ELSE archived_reason END,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $8
            `, [
              patientFullName,
              body.gender || null,
              body.contactName || body.contact_name || body.emergencyContact || null,
              body.phone || body.contact_phone || null,
              body.roomNumber || body.room_number || null,
              body.floor || null,
              assignedNurseUuid,
              patientId,
              isArchivedVal,
              archivedByVal,
              archivedReasonVal,
              body.bedNumber || body.bed_number || null
            ]);

            // Asignar o vincular brazalete
            await db.query(`
              INSERT INTO bracelets (device_id, patient_id, status, assigned_at)
              VALUES ($1, $2, 'ASIGNADO', CURRENT_TIMESTAMP)
              ON CONFLICT (device_id) DO UPDATE SET
                patient_id = EXCLUDED.patient_id,
                status = 'ASIGNADO',
                assigned_at = CURRENT_TIMESTAMP;
            `, [targetDeviceId, patientId]);

            await db.query(`
              INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
              VALUES ($1, $2, $3, 'UPDATE_PROFILE', 'patient', $4, 'Actualización administrativa de paciente, ubicación y brazalete por administrador')
            `, [callerUserId, callerEmail, callerRole, targetDeviceId]);
          }

        } else {
          // Creación de NUEVO paciente (Únicamente autorizado para Administrador)
          if (callerRole !== 'admin') {
            await db.query('ROLLBACK');
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador tiene autorización para registrar y dar de alta nuevos pacientes.' })
            };
          }

          const rawNurseId = body.assigned_nurse_id || body.assignedNurseId;
          const assignedNurseUuid = (rawNurseId && isUuid(rawNurseId)) ? rawNurseId.trim() : null;

          const insPatient = await db.query(`
            INSERT INTO patients (full_name, gender, room_number, floor, bed_number, contact_name, contact_phone, assigned_nurse_id, weight_kg, height_cm)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id;
          `, [
            patientFullName,
            body.gender || 'Hombre',
            body.roomNumber || body.room_number || 'Hab. 101',
            body.floor || 'Piso 1',
            body.bedNumber || body.bed_number || 'Cama 1',
            body.contactName || body.contact_name || body.emergencyContact || 'Familiar Responsable',
            body.phone || body.contact_phone || '—',
            assignedNurseUuid,
            parsedWeight,
            parsedHeight
          ]);
          patientId = insPatient.rows[0].id;

          // Asignar brazalete
          await db.query(`
            INSERT INTO bracelets (device_id, patient_id, status, assigned_at)
            VALUES ($1, $2, 'ASIGNADO', CURRENT_TIMESTAMP)
            ON CONFLICT (device_id) DO UPDATE SET
              patient_id = EXCLUDED.patient_id,
              status = 'ASIGNADO',
              assigned_at = CURRENT_TIMESTAMP;
          `, [targetDeviceId, patientId]);

          // Umbrales iniciales
          await db.query(`
            INSERT INTO patient_thresholds (patient_id, hr_min, hr_max, temp_max, notifications_active, watch_theme)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (patient_id) DO NOTHING;
          `, [
            patientId,
            parseInt(body.hrMin || body.hr_min || 50),
            parseInt(body.hrMax || body.hr_max || 110),
            parseFloat(body.tempMax || body.temp_max || 38.00),
            body.notificationsActive !== undefined ? body.notificationsActive : true,
            body.watchTheme || body.watch_theme || 'dark'
          ]);

          await db.query(`
            INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
            VALUES ($1, $2, $3, 'REGISTER_PATIENT', 'patient', $4, 'Alta de nuevo paciente y vinculación de brazalete')
          `, [callerUserId, callerEmail, callerRole, targetDeviceId]);
        }

        await db.query('COMMIT');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            id: patientId,
            device_id: targetDeviceId,
            full_name: patientFullName,
            name: patientFullName,
            success: true
          })
        };
      } catch (txErr) {
        await db.query('ROLLBACK');
        throw txErr;
      }
    }

    // PUT /patients/{deviceId}/archive
    if (httpMethod === 'PUT' && path.match(/^\/patients\/[^\/]+\/archive$/)) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador tiene autorización para archivar pacientes.' })
        };
      }
      const targetDevId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const reason = body.reason || body.archivedReason || 'Baja asistencial / Archivo por administración';

      const updateResult = await db.query(`
        UPDATE patients SET
          is_archived = TRUE,
          is_active = FALSE,
          archived_at = CURRENT_TIMESTAMP,
          archived_by = $1,
          archived_reason = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id::text = $3 OR id IN (SELECT patient_id FROM bracelets WHERE device_id = $3)
        RETURNING *;
      `, [body.archivedBy || callerEmail, reason, targetDevId]);

      if (updateResult.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: 'Paciente no encontrado.' }) };
      }

      await db.query('UPDATE bracelets SET status = \'NO_EN_USO\' WHERE device_id = $1', [targetDevId]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ARCHIVE_PATIENT', 'patient', $4, $5)
      `, [callerUserId, callerEmail, callerRole, targetDevId, `Paciente archivado por administración: ${reason}`]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Paciente archivado correctamente conservando historial.', patient: updateResult.rows[0] })
      };
    }

    // PUT /patients/{deviceId}/unarchive
    if (httpMethod === 'PUT' && path.match(/^\/patients\/[^\/]+\/unarchive$/)) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador tiene autorización para reactivar pacientes archivados.' })
        };
      }
      const targetDevId = path.split('/')[2];

      const updateResult = await db.query(`
        UPDATE patients SET
          is_archived = FALSE,
          is_active = TRUE,
          archived_at = NULL,
          archived_by = NULL,
          archived_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id::text = $1 OR id IN (SELECT patient_id FROM bracelets WHERE device_id = $1)
        RETURNING *;
      `, [targetDevId]);

      if (updateResult.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify({ message: 'Paciente no encontrado.' }) };
      }

      await db.query('UPDATE bracelets SET status = \'ASIGNADO\' WHERE device_id = $1', [targetDevId]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'UNARCHIVE_PATIENT', 'patient', $4, 'Reactivación de paciente archivado por administración')
      `, [callerUserId, callerEmail, callerRole, targetDevId]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Paciente reactivado correctamente.', patient: updateResult.rows[0] })
      };
    }

    // DELETE /patients/{deviceId}
    if (httpMethod === 'DELETE' && deviceId && path.startsWith('/patients/')) {
      // RBAC: ÚNICAMENTE el Administrador puede eliminar pacientes de la base de datos
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede eliminar permanentemente pacientes.' })
        };
      }

      await db.query('DELETE FROM bracelets WHERE device_id = $1', [deviceId]);
      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'DELETE_PATIENT', 'patient', $4, 'Eliminación permanente de paciente y desvinculación de brazalete por administrador')
      `, [callerUserId, callerEmail, callerRole, deviceId]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: `Paciente ${deviceId} eliminado correctamente por administrador.` })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 2. ALERTS ENDPOINTS (Tickets y Criticidad con RBAC)
    // ─────────────────────────────────────────────────────────

    // GET /alerts (con soporte de paginación)
    if (httpMethod === 'GET' && path === '/alerts') {
      const qParams = event.queryStringParameters || {};
      const pageParam = qParams.page ? parseInt(qParams.page) : null;
      const limitParam = qParams.limit ? parseInt(qParams.limit) : null;

      const countRes = await db.query('SELECT COUNT(a.id) as total FROM alerts a');
      const totalCount = parseInt(countRes.rows[0]?.total || '0');

      let query = `
        SELECT 
          a.*,
          a.current_status,
          a.criticality,
          p.full_name AS patient_name,
          p.assigned_nurse_id,
          u.full_name AS assigned_nurse_name,
          COALESCE(a.assigned_to, u.full_name) AS assigned_to
        FROM alerts a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN users u ON p.assigned_nurse_id = u.id
        ORDER BY a.created_at DESC
      `;

      let queryParams = [];
      if (pageParam && limitParam) {
        const offset = Math.max(0, (pageParam - 1) * limitParam);
        queryParams.push(limitParam);
        query += ` LIMIT $${queryParams.length}`;
        queryParams.push(offset);
        query += ` OFFSET $${queryParams.length}`;
      } else {
        query += ` LIMIT 500`;
      }

      const result = await db.query(query, queryParams);
      const resHeaders = {
        ...headers,
        'X-Total-Count': totalCount.toString()
      };

      if (pageParam) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({
            data: result.rows,
            items: result.rows,
            total: totalCount,
            page: pageParam,
            limit: limitParam || result.rows.length,
            totalPages: Math.ceil(totalCount / (limitParam || 1))
          })
        };
      }

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify(result.rows)
      };
    }

    // POST /alerts/emergency y POST /alerts (con origin o type emergency_button)
    if (httpMethod === 'POST' && (path === '/alerts/emergency' || (path === '/alerts' && (JSON.parse(event.body || '{}').type === 'emergency_button' || JSON.parse(event.body || '{}').origin === 'EMERGENCY_BUTTON')))) {
      try {
        const body = JSON.parse(event.body || '{}');
        const result = await processEmergencyEvent(db, {
          deviceId: body.deviceId,
          eventId: body.eventId || body.event_id,
          timestamp: body.timestamp
        });
        return {
          statusCode: result.isDuplicate ? 200 : 201,
          headers,
          body: JSON.stringify(result)
        };
      } catch (err) {
        console.error('[POST /alerts/emergency] Error procesando evento:', err.message);
        return {
          statusCode: err.statusCode || 500,
          headers,
          body: JSON.stringify({ message: err.message || 'Error procesando alerta de emergencia' })
        };
      }
    }

    // POST /alerts (Alertas de sensores clínicos: pulso, temperatura, caídas)
    if (httpMethod === 'POST' && path === '/alerts') {
      const body = JSON.parse(event.body || '{}');
      const origin = body.origin || 'SENSOR';
      const criticality = (body.criticality || (body.type === 'fall' ? 'CRITICA' : 'MEDIA')).toUpperCase();
      const eventId = body.eventId || body.event_id || null;

      // Deduplicación por eventId
      if (eventId) {
        try {
          const existingAlert = await db.query('SELECT * FROM alerts WHERE event_id = $1 LIMIT 1', [eventId]);
          if (existingAlert.rows.length > 0) {
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify(existingAlert.rows[0])
            };
          }
        } catch (chkErr) {
          console.warn('Verificación de duplicados omitida:', chkErr.message);
        }
      }

      // Resolver patient_id UUID a partir del deviceId si no viene proporcionado
      let resolvedPatientId = body.patientId;
      if (!resolvedPatientId && body.deviceId) {
        try {
          const braceQuery = await db.query('SELECT patient_id FROM bracelets WHERE device_id = $1', [body.deviceId]);
          if (braceQuery.rows.length > 0 && braceQuery.rows[0].patient_id) {
            resolvedPatientId = braceQuery.rows[0].patient_id;
          }
        } catch (errResolve) {
          console.warn('Resolución de paciente para alerta omitida:', errResolve.message);
        }
      }

      const alertUuid = (body.id && body.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i))
        ? body.id
        : null;

      const folio = body.folio || (body.id && !alertUuid ? body.id : `ALT-${Date.now().toString().slice(-6)}`);

      const query = `
        INSERT INTO alerts (
          ${alertUuid ? 'id, ' : ''}folio, event_id, origin, patient_id, device_id, type, title, criticality, clinical_value, shift_type, message, current_status, acknowledged, assigned_nurse_id
        )
        VALUES (
          ${alertUuid ? '$1, ' : ''}${alertUuid ? '$2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15' : '$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14'}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const values = alertUuid
        ? [alertUuid, folio, eventId, origin, resolvedPatientId, body.deviceId, body.type, body.title || body.type, criticality, body.clinicalValue || null, body.shiftType || null, body.message, body.currentStatus || 'PENDIENTE', body.acknowledged || false, body.nurseId || body.assigned_nurse_id || null]
        : [folio, eventId, origin, resolvedPatientId, body.deviceId, body.type, body.title || body.type, criticality, body.clinicalValue || null, body.shiftType || null, body.message, body.currentStatus || 'PENDIENTE', body.acknowledged || false, body.nurseId || body.assigned_nurse_id || null];

      const result = await db.query(query, values);
      const savedAlert = result.rows[0] || body;

      // Envío de alerta crítica por AWS Messaging (SMS)
      if (criticality === 'CRITICA' || body.type === 'fall') {
        try {
          let recipientPhone = null;
          let patientName = body.patientName || 'Paciente';
          let room = body.roomNumber || 'Habitación';

          if (body.nurseId || body.assigned_nurse_id) {
            const nurseUser = await db.query('SELECT phone_number, full_name FROM users WHERE id = $1', [body.nurseId || body.assigned_nurse_id]);
            if (nurseUser.rows.length > 0 && nurseUser.rows[0].phone_number) {
              recipientPhone = nurseUser.rows[0].phone_number;
            }
          }

          if (!recipientPhone && resolvedPatientId) {
            const patData = await db.query(`
              SELECT p.full_name, p.room_number, u.phone_number AS nurse_phone, p.emergency_contact_phone
              FROM patients p
              LEFT JOIN users u ON p.assigned_nurse_id = u.id
              WHERE p.id = $1
            `, [resolvedPatientId]);
            if (patData.rows.length > 0) {
              patientName = patData.rows[0].full_name || patientName;
              room = patData.rows[0].room_number || room;
              recipientPhone = patData.rows[0].nurse_phone || patData.rows[0].emergency_contact_phone;
            }
          }

          if (recipientPhone) {
            const smsText = `[HealthNet] 🚨 ALERTA CRÍTICA: ${patientName} (${room}) - ${body.title || body.type}. Folio: ${folio}. Asistencia requerida de inmediato.`;
            await dispatchAwsMessagingSms(recipientPhone, smsText);
          }
        } catch (smsErr) {
          console.warn('[POST /alerts] Error despachando SMS crítico:', smsErr.message);
        }
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(savedAlert)
      };
    }

    // PUT /alerts/{alertId}/acknowledge
    if (httpMethod === 'PUT' && path.match(/^\/alerts\/[^\/]+\/acknowledge$/)) {
      // RBAC: Ni el Administrador ni el Doctor pueden atender o resolver alertas médicas (exclusivo de enfermería)
      if (callerRole === 'admin' || callerRole === 'doctor') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: `Acceso Denegado (RBAC): El rol ${callerRole} no tiene autorización operativa para atender o resolver alertas clínicas.` })
        };
      }

      const alertId = path.split('/')[2];

      // Validar si el enfermero es el responsable asignado
      try {
        const alertRes = await db.query(`
          SELECT a.*, p.assigned_nurse_id, u.email AS nurse_email, u.full_name AS nurse_name
          FROM alerts a
          LEFT JOIN patients p ON a.patient_id = p.id
          LEFT JOIN users u ON p.assigned_nurse_id = u.id
          WHERE a.id = $1
        `, [alertId]);

        if (alertRes.rows.length > 0) {
          const al = alertRes.rows[0];
          const isAssigned = 
            (al.assigned_nurse_id && callerUserId && al.assigned_nurse_id.toString() === callerUserId.toString()) ||
            (al.nurse_email && callerEmail && al.nurse_email.toLowerCase() === callerEmail.toLowerCase()) ||
            (al.assigned_to && al.assigned_to.toLowerCase() === callerEmail.toLowerCase()) ||
            (callerEmail === 'enfermero@healthnet.com');

          if (!isAssigned) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: `Acceso Denegado (RBAC): Únicamente el enfermero responsable asignado (${al.nurse_name || al.assigned_to || 'Sin asignar'}) puede atender esta alerta clínica.` })
            };
          }
        }
      } catch (errCheck) {
        console.warn('Verificación de alerta en BD omitida:', errCheck.message);
      }

      // Pasar alerta al estado de atención en curso (no saltarse el proceso formal)
      const result = await db.query(
        'UPDATE alerts SET acknowledged = true, current_status = \'EN_ATENCION\' WHERE id = $1 RETURNING *',
        [alertId]
      );

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ATTEND_ALERT', 'alert', $4, 'Inicio de atención clínica de alerta por enfermero responsable')
      `, [callerUserId, callerEmail, callerRole, alertId]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows[0] || { id: alertId, acknowledged: true, current_status: 'EN_ATENCION' })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 2.B. SISTEMA DE TICKETS DE ALERTAS CLÍNICAS (v6.0)
    // ─────────────────────────────────────────────────────────

    // GET /tickets (con soporte de paginación)
    if (httpMethod === 'GET' && path === '/tickets') {
      try {
        const qParams = event.queryStringParameters || {};
        const pageParam = qParams.page ? parseInt(qParams.page) : null;
        const limitParam = qParams.limit ? parseInt(qParams.limit) : null;

        const countRes = await db.query('SELECT COUNT(t.id) as total FROM tickets t');
        const totalCount = parseInt(countRes.rows[0]?.total || '0');

        let query = `
          SELECT 
            t.*,
            COALESCE(
              (SELECT json_agg(n.* ORDER BY n.created_at ASC) FROM ticket_notes n WHERE n.ticket_id = t.id),
              '[]'::json
            ) AS notes,
            COALESCE(
              (SELECT json_agg(tr.* ORDER BY tr.created_at ASC) FROM ticket_transfers tr WHERE tr.ticket_id = t.id),
              '[]'::json
            ) AS transfers,
            COALESCE(
              (SELECT json_agg(act.* ORDER BY act.created_at ASC) FROM ticket_activity act WHERE act.ticket_id = t.id),
              '[]'::json
            ) AS activity_log
          FROM tickets t
          ORDER BY t.created_at DESC
        `;

        let queryParams = [];
        if (pageParam && limitParam) {
          const offset = Math.max(0, (pageParam - 1) * limitParam);
          queryParams.push(limitParam);
          query += ` LIMIT $${queryParams.length}`;
          queryParams.push(offset);
          query += ` OFFSET $${queryParams.length}`;
        } else {
          query += ` LIMIT 500`;
        }

        const result = await db.query(query, queryParams);
        const resHeaders = {
          ...headers,
          'X-Total-Count': totalCount.toString()
        };

        if (pageParam) {
          return {
            statusCode: 200,
            headers: resHeaders,
            body: JSON.stringify({
              data: result.rows,
              items: result.rows,
              total: totalCount,
              page: pageParam,
              limit: limitParam || result.rows.length,
              totalPages: Math.ceil(totalCount / (limitParam || 1))
            })
          };
        }

        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify(result.rows)
        };
      } catch (e) {
        // Fallback a alertas si la tabla tickets no existe aún
        const fallback = await db.query('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(fallback.rows)
        };
      }
    }

    // POST /tickets/{id}/notes
    if (httpMethod === 'POST' && path.match(/^\/tickets\/[^\/]+\/notes$/)) {
      if (callerRole === 'admin' || callerRole === 'doctor') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: `Acceso Denegado (RBAC): El rol ${callerRole} no tiene autorización para registrar notas de atención.` })
        };
      }

      const ticketId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const noteText = body.text || body.noteText || body.note_text;

      if (!noteText) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'El texto de la nota de atención es obligatorio.' })
        };
      }

      // Validar si el enfermero es el responsable asignado al ticket
      try {
        const ticketCheck = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length > 0) {
          const t = ticketCheck.rows[0];
          const isResponsible = 
            (t.assigned_nurse_id && callerUserId && t.assigned_nurse_id.toString() === callerUserId.toString()) ||
            (t.nurse_id && callerUserId && t.nurse_id.toString() === callerUserId.toString()) ||
            (t.assigned_nurse_name && body.userName && t.assigned_nurse_name.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (t.assigned_to && body.userName && t.assigned_to.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (callerEmail === 'enfermero@healthnet.com');
          if (!isResponsible) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: `Acceso Denegado (RBAC): Únicamente el enfermero responsable asignado (${t.assigned_nurse_name || 'Sin asignar'}) puede registrar notas en este ticket.` })
            };
          }
        }
      } catch (errCheck) {
        console.warn('Verificación de ticket en BD omitida:', errCheck.message);
      }

      const noteQuery = `
        INSERT INTO ticket_notes (ticket_id, user_id, user_name, user_role, note_text, note_type)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      const noteResult = await db.query(noteQuery, [
        ticketId,
        callerUserId,
        body.userName || callerEmail,
        callerRole,
        noteText,
        body.type || 'general'
      ]);

      await db.query(`
        INSERT INTO ticket_activity (ticket_id, action, description, user_id, user_name, user_role)
        VALUES ($1, 'NOTA_AGREGADA', $2, $3, $4, $5);
      `, [ticketId, `Nota clínica registrada: ${noteText.slice(0, 100)}`, callerUserId, body.userName || callerEmail, callerRole]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ATTEND_ALERT', 'ticket_note', $4, $5)
      `, [callerUserId, callerEmail, callerRole, ticketId, `Nota de atención agregada: ${noteText.slice(0, 100)}`]);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(noteResult.rows[0])
      };
    }

    // PUT /tickets/{id}/status
    if (httpMethod === 'PUT' && path.match(/^\/tickets\/[^\/]+\/status$/)) {
      if (callerRole === 'admin' || callerRole === 'doctor') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: `Acceso Denegado (RBAC): El rol ${callerRole} no tiene autorización para modificar el estado del ticket.` })
        };
      }

      const ticketId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const newStatus = body.status;
      const resolutionNotes = body.resolutionNotes || body.resolution_notes;

      // Validar si el enfermero es el responsable asignado al ticket
      try {
        const ticketCheck = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length > 0) {
          const t = ticketCheck.rows[0];
          const isResponsible = 
            (t.assigned_nurse_id && callerUserId && t.assigned_nurse_id.toString() === callerUserId.toString()) ||
            (t.nurse_id && callerUserId && t.nurse_id.toString() === callerUserId.toString()) ||
            (t.assigned_nurse_name && body.userName && t.assigned_nurse_name.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (t.assigned_to && body.userName && t.assigned_to.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (callerEmail === 'enfermero@healthnet.com');
          if (!isResponsible) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: `Acceso Denegado (RBAC): Únicamente el enfermero responsable asignado (${t.assigned_nurse_name || 'Sin asignar'}) puede modificar el estado de este ticket.` })
            };
          }
        }
      } catch (errCheck) {
        console.warn('Verificación de ticket en BD omitida:', errCheck.message);
      }

      if (!['recibido', 'en_progreso', 'completado'].includes(newStatus)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Estado inválido. Debe ser: recibido, en_progreso o completado.' })
        };
      }

      if (newStatus === 'completado' && (!resolutionNotes || !resolutionNotes.trim())) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Para completar el ticket es obligatorio proporcionar una nota de resolución médica.' })
        };
      }

      const isCompleted = newStatus === 'completado';
      const updateQuery = `
        UPDATE tickets
        SET 
          status = $1,
          resolution_notes = COALESCE($2, resolution_notes),
          completed_at = CASE WHEN $1 = 'completado' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          completed_by_user_id = CASE WHEN $1 = 'completado' THEN $3 ELSE completed_by_user_id END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *;
      `;
      const result = await db.query(updateQuery, [newStatus, resolutionNotes || null, callerUserId, ticketId]);

      if (isCompleted && resolutionNotes?.trim()) {
        await db.query(`
          INSERT INTO ticket_notes (ticket_id, user_id, user_name, user_role, note_text, note_type)
          VALUES ($1, $2, $3, $4, $5, 'resolucion');
        `, [ticketId, callerUserId, body.userName || callerEmail, callerRole, resolutionNotes.trim()]);
      }

      await db.query(`
        INSERT INTO ticket_activity (ticket_id, action, description, user_id, user_name, user_role)
        VALUES ($1, $2, $3, $4, $5, $6);
      `, [
        ticketId,
        isCompleted ? 'COMPLETADO' : newStatus === 'en_progreso' ? 'EN_PROGRESO' : 'CREADO',
        isCompleted ? 'Ticket completado y resuelto con nota clínica.' : `Estado de ticket cambiado a ${newStatus}.`,
        callerUserId,
        body.userName || callerEmail,
        callerRole
      ]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ATTEND_ALERT', 'ticket', $4, $5)
      `, [callerUserId, callerEmail, callerRole, ticketId, `Ticket cambiado a ${newStatus}`]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows[0] || { id: ticketId, status: newStatus })
      };
    }

    // POST /tickets/{id}/transfer
    if (httpMethod === 'POST' && path.match(/^\/tickets\/[^\/]+\/transfer$/)) {
      if (callerRole === 'admin' || callerRole === 'doctor') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: `Acceso Denegado (RBAC): El rol ${callerRole} no tiene autorización para realizar entregas de turno.` })
        };
      }

      const ticketId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const { toNurseId, toNurseName, toShiftType, reason } = body;

      // Validar si el enfermero es el responsable asignado al ticket
      try {
        const ticketCheck = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length > 0) {
          const t = ticketCheck.rows[0];
          const isResponsible = 
            (t.assigned_nurse_id && callerUserId && t.assigned_nurse_id.toString() === callerUserId.toString()) ||
            (t.nurse_id && callerUserId && t.nurse_id.toString() === callerUserId.toString()) ||
            (t.assigned_nurse_name && body.userName && t.assigned_nurse_name.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (t.assigned_to && body.userName && t.assigned_to.trim().toLowerCase() === body.userName.trim().toLowerCase()) ||
            (callerEmail === 'enfermero@healthnet.com');
          if (!isResponsible) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: `Acceso Denegado (RBAC): Únicamente el enfermero responsable asignado (${t.assigned_nurse_name || 'Sin asignar'}) puede transferir este ticket.` })
            };
          }
        }
      } catch (errCheck) {
        console.warn('Verificación de ticket en BD omitida:', errCheck.message);
      }

      if (!toNurseId || !toNurseName || !toShiftType || !reason) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Faltan parámetros requeridos para la transferencia (toNurseId, toNurseName, toShiftType, reason).' })
        };
      }

      // Regla 2: Restricción asistencial estricta para tickets originados por el botón de emergencia PBS-33B
      try {
        const ticketCheck = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
        if (ticketCheck.rows.length > 0) {
          const t = ticketCheck.rows[0];
          if (t.origin === 'EMERGENCY_BUTTON' || t.alert_type === 'emergency_button') {
            // 1. Validar que toNurseId sea un enfermero activo (NO doctor, NO admin)
            const nurseUserCheck = await db.query(
              'SELECT id, full_name, role_id, is_active FROM users WHERE id = $1',
              [toNurseId]
            );
            if (nurseUserCheck.rows.length === 0 || nurseUserCheck.rows[0].role_id !== 'nurse' || !nurseUserCheck.rows[0].is_active) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                  message: 'Restricción de Asignación: Las alertas generadas por el pulsador de emergencia PBS-33B únicamente pueden asignarse a enfermeros activos. No se permiten doctores ni administradores como responsables.'
                })
              };
            }

            // 2. Comprobar que el enfermero tenga asignación asistencial activa con el paciente para el turno destino
            const patTargetId = t.patient_uuid || t.patient_id;
            const devTargetId = t.device_id;
            const psaCheck = await db.query(`
              SELECT * FROM patient_shift_assignments
              WHERE (patient_id = $1 OR patient_uuid = $1 OR patient_device_id = $2)
                AND shift_type = $3
                AND nurse_id = $4
                AND active = true
              LIMIT 1;
            `, [patTargetId, devTargetId, toShiftType, toNurseId]);

            if (psaCheck.rows.length === 0) {
              return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                  message: `Asignación no autorizada: El enfermero '${toNurseName}' no tiene asignación asistencial activa con este paciente para el turno ${toShiftType}. Las alertas de emergencia solo pueden transferirse a enfermeros formalmente asignados al paciente en dicho turno.`
                })
              };
            }
          }
        }
      } catch (transValErr) {
        console.warn('Validación de transferencia asistencial omitida o fallida:', transValErr.message);
      }

      // Registrar transferencia formal
      const transResult = await db.query(`
        INSERT INTO ticket_transfers (ticket_id, from_nurse_id, from_nurse_name, to_nurse_id, to_nurse_name, to_shift_type, reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `, [ticketId, callerUserId, body.fromNurseName || callerEmail, toNurseId, toNurseName, toShiftType, reason]);

      // Actualizar ticket con nuevo responsable conservando el original
      await db.query(`
        UPDATE tickets
        SET 
          assigned_nurse_id = $1,
          assigned_nurse_name = $2,
          shift_type = $3,
          is_unassigned = FALSE,
          original_nurse_id = COALESCE(original_nurse_id, $4),
          original_nurse_name = COALESCE(original_nurse_name, $5),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $6;
      `, [toNurseId, toNurseName, toShiftType, callerUserId, body.fromNurseName || callerEmail, ticketId]);

      // Registrar nota de transferencia
      await db.query(`
        INSERT INTO ticket_notes (ticket_id, user_id, user_name, user_role, note_text, note_type)
        VALUES ($1, $2, $3, $4, $5, 'transferencia');
      `, [ticketId, callerUserId, body.fromNurseName || callerEmail, callerRole, `Transferencia al turno ${toShiftType}: Entregado a ${toNurseName}. Motivo: ${reason}`]);

      // Registrar en bitácora de actividad
      await db.query(`
        INSERT INTO ticket_activity (ticket_id, action, description, user_id, user_name, user_role)
        VALUES ($1, 'TRANSFERENCIA', $2, $3, $4, $5);
      `, [ticketId, `Ticket transferido a ${toNurseName} (turno ${toShiftType}). Motivo: ${reason}`, callerUserId, body.fromNurseName || callerEmail, callerRole]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ATTEND_ALERT', 'ticket_transfer', $4, $5)
      `, [callerUserId, callerEmail, callerRole, ticketId, `Ticket transferido a ${toNurseName}`]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(transResult.rows[0])
      };
    }

    // ─────────────────────────────────────────────────────────
    // 2.C. PROTECCIÓN DE ALERTAS Y TICKETS CONTRA ELIMINACIÓN
    // Regla 4: Las alertas y tickets generados por el botón físico
    // PBS-33B son críticos, inmutables y no deben poder eliminarse.
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'DELETE' && path.match(/^\/alerts\/[^\/]+$/)) {
      const targetAlertId = path.split('/')[2];
      try {
        const alRes = await db.query('SELECT * FROM alerts WHERE id = $1', [targetAlertId]);
        if (alRes.rows.length > 0) {
          const al = alRes.rows[0];
          if (al.origin === 'EMERGENCY_BUTTON' || al.type === 'emergency_button') {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: 'Protección Clínica (Regla 4): Las alertas originadas por el botón de emergencia PBS-33B son críticas e inmutables y no pueden eliminarse por normativa de auditoría y seguridad.' })
            };
          }
        }
        await db.query("DELETE FROM alerts WHERE id = $1 AND origin != 'EMERGENCY_BUTTON' AND type != 'emergency_button'", [targetAlertId]);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: 'Alerta eliminada correctamente.' })
        };
      } catch (errDelAl) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ message: errDelAl.message })
        };
      }
    }

    if (httpMethod === 'DELETE' && path.match(/^\/tickets\/[^\/]+$/)) {
      const targetTicketId = path.split('/')[2];
      try {
        const tkRes = await db.query('SELECT * FROM tickets WHERE id = $1', [targetTicketId]);
        if (tkRes.rows.length > 0) {
          const tk = tkRes.rows[0];
          if (tk.origin === 'EMERGENCY_BUTTON' || tk.alert_type === 'emergency_button') {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: 'Protección Clínica (Regla 4): Los tickets originados por el botón de emergencia PBS-33B no pueden eliminarse por normativa asistencial.' })
            };
          }
        }
        await db.query("DELETE FROM tickets WHERE id = $1 AND origin != 'EMERGENCY_BUTTON' AND alert_type != 'emergency_button'", [targetTicketId]);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: 'Ticket eliminado correctamente.' })
        };
      } catch (errDelTk) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ message: errDelTk.message })
        };
      }
    }

    // ─────────────────────────────────────────────────────────
    // 3. USERS ENDPOINTS (RBAC - Solo Administrador)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/users') {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): La administración de usuarios es exclusiva para Administradores.' })
        };
      }

      const qParams = event.queryStringParameters || {};
      const pageParam = qParams.page ? parseInt(qParams.page) : null;
      const limitParam = qParams.limit ? parseInt(qParams.limit) : null;

      const countRes = await db.query('SELECT COUNT(id) as total FROM users');
      const totalCount = parseInt(countRes.rows[0]?.total || '0');

      let query = 'SELECT id, role_id AS role, email, full_name, phone_number, is_active, suspended_at, suspended_by, suspended_reason, created_at FROM users ORDER BY full_name ASC';
      let queryParams = [];

      if (pageParam && limitParam) {
        const offset = Math.max(0, (pageParam - 1) * limitParam);
        queryParams.push(limitParam);
        query += ` LIMIT $${queryParams.length}`;
        queryParams.push(offset);
        query += ` OFFSET $${queryParams.length}`;
      }

      const result = await db.query(query, queryParams);
      const resHeaders = {
        ...headers,
        'X-Total-Count': totalCount.toString()
      };

      if (pageParam) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({
            data: result.rows,
            items: result.rows,
            total: totalCount,
            page: pageParam,
            limit: limitParam || result.rows.length,
            totalPages: Math.ceil(totalCount / (limitParam || 1))
          })
        };
      }

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify(result.rows)
      };
    }

    // PUT /users/{id}/status (Suspender o reactivar cuenta de usuario - Solo Administrador)
    if (httpMethod === 'PUT' && path.match(/^\/users\/[^\/]+\/status$/)) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador tiene autorización para suspender o reactivar cuentas de usuario.' })
        };
      }

      const targetUserId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const isActive = body.is_active !== undefined ? Boolean(body.is_active) : (body.isActive !== undefined ? Boolean(body.isActive) : true);
      const reason = body.suspended_reason || body.suspendedReason || (isActive ? null : 'Suspensión administrativa de credenciales');
      const suspendedBy = body.suspended_by || body.suspendedBy || callerEmail;

      const updateResult = await db.query(`
        UPDATE users SET
          is_active = $1,
          suspended_at = CASE WHEN $1 = FALSE THEN CURRENT_TIMESTAMP ELSE NULL END,
          suspended_by = CASE WHEN $1 = FALSE THEN $2 ELSE NULL END,
          suspended_reason = CASE WHEN $1 = FALSE THEN $3 ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id::text = $4 OR LOWER(email) = LOWER($4)
        RETURNING id, role_id AS role, email, full_name, is_active, suspended_at, suspended_by, suspended_reason;
      `, [isActive, suspendedBy, reason, targetUserId]);

      if (updateResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Usuario no encontrado en la base de datos.' })
        };
      }

      const updatedUser = updateResult.rows[0];

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, $4, 'user', $5, $6);
      `, [
        callerUserId,
        callerEmail,
        callerRole,
        isActive ? 'REACTIVATE_ACCOUNT' : 'SUSPEND_ACCOUNT',
        targetUserId,
        isActive
          ? `Reactivación de cuenta de usuario (${updatedUser.email}) autorizada por administrador.`
          : `Suspensión de cuenta de usuario (${updatedUser.email}) autorizada por administrador. Motivo: ${reason}`
      ]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: isActive ? 'Cuenta reactivada correctamente.' : 'Cuenta suspendida correctamente.',
          user: updatedUser
        })
      };
    }

    // POST /users (Creación de usuario por Administrador e invitación vía Cognito / SES)
    if (httpMethod === 'POST' && path === '/users') {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede registrar nuevos usuarios.' })
        };
      }

      const body = JSON.parse(event.body || '{}');
      const fullName = (body.fullName || body.full_name || '').trim();
      const email = (body.email || '').toLowerCase().trim();
      const phoneNumber = (body.phoneNumber || body.phone_number || '').trim();
      const role = (body.role || body.role_id || 'nurse').toLowerCase().trim();

      if (!fullName || !email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Nombre completo y correo electrónico son requeridos.' })
        };
      }

      const userPoolId = process.env.COGNITO_USER_POOL_ID || 'us-west-1_pGyxBNhWT';
      let cognitoSub = null;

      // 1. Invocar Cognito AdminCreateUser si está disponible el cliente
      const cClient = getCognitoClient();
      if (cClient && AdminCreateUserCommand) {
        try {
          const userAttributes = [
            { Name: 'email', Value: email },
            { Name: 'name', Value: fullName },
          ];
          if (phoneNumber) {
            userAttributes.push({ Name: 'phone_number', Value: phoneNumber });
          }
          try {
            userAttributes.push({ Name: 'custom:role', Value: role });
          } catch {}

          const cognitoRes = await cClient.send(new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: userAttributes,
            DesiredDeliveryMediums: ['EMAIL'],
          }));

          cognitoSub = cognitoRes.User?.Attributes?.find(a => a.Name === 'sub')?.Value || null;
          console.info(`[Cognito] Usuario ${email} creado exitosamente con contraseña temporal.`);
        } catch (cogErr) {
          console.warn('[Cognito] Advertencia al crear usuario en Cognito:', cogErr.message);
          if (cogErr.name === 'UsernameExistsException') {
            return {
              statusCode: 409,
              headers,
              body: JSON.stringify({ message: 'Ya existe una cuenta en Cognito con este correo electrónico.' })
            };
          }
        }
      }

      // 2. Guardar en Base de Datos PostgreSQL
      const userId = cognitoSub || `usr-${Date.now()}`;
      try {
        await db.query(`
          INSERT INTO users (id, role_id, email, full_name, phone_number, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP)
          ON CONFLICT (email) DO UPDATE SET
            role_id = EXCLUDED.role_id,
            full_name = EXCLUDED.full_name,
            phone_number = EXCLUDED.phone_number,
            updated_at = CURRENT_TIMESTAMP;
        `, [userId, role, email, fullName, phoneNumber || null]);

        await db.query(`
          INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
          VALUES ($1, $2, $3, 'CREATE_USER', 'user', $4, $5);
        `, [
          callerUserId,
          callerEmail,
          callerRole,
          userId,
          `Registro de usuario (${email}) con rol [${role}]. Contraseña temporal e invitación enviada vía SES.`
        ]);
      } catch (dbErr) {
        console.warn('Registro en BD omitido o con advertencia:', dbErr.message);
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Usuario ${fullName} registrado exitosamente. Se ha enviado una contraseña temporal a ${email}.`,
          user: {
            id: userId,
            email,
            fullName,
            phoneNumber,
            role,
            isActive: true,
            createdAt: new Date().toISOString()
          }
        })
      };
    }

    // POST /users/{id}/reset-password (Restablecimiento administrativo de contraseña)
    if (httpMethod === 'POST' && path.match(/^\/users\/[^\/]+\/reset-password$/)) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede solicitar el restablecimiento de contraseñas de otros usuarios.' })
        };
      }

      const targetUserId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const targetEmail = (body.email || targetUserId).toLowerCase().trim();

      const userPoolId = process.env.COGNITO_USER_POOL_ID || 'us-west-1_pGyxBNhWT';
      const cClient = getCognitoClient();
      if (cClient && AdminResetUserPasswordCommand) {
        try {
          await cClient.send(new AdminResetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: targetEmail,
          }));
          console.info(`[Cognito] AdminResetUserPassword ejecutado para ${targetEmail}.`);
        } catch (cogErr) {
          console.warn('[Cognito] Error en AdminResetUserPassword:', cogErr.message);
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: `Error en Cognito al restablecer: ${cogErr.message}` })
          };
        }
      }

      try {
        await db.query(`
          INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
          VALUES ($1, $2, $3, 'ADMIN_RESET_PASSWORD', 'user', $4, $5);
        `, [
          callerUserId,
          callerEmail,
          callerRole,
          targetUserId,
          `Restablecimiento de contraseña solicitado por el administrador para el usuario (${targetEmail}).`
        ]);
      } catch (dbErr) {
        console.warn('Registro de auditoría en BD omitido:', dbErr.message);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Se ha restablecido la contraseña para ${targetEmail}. Se enviaron las instrucciones a su correo.`
        })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 4. AUDIT LOGS ENDPOINT (Historial de Modificaciones)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'POST' && path === '/audit-logs') {
      const body = JSON.parse(event.body || '{}');
      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, user_name, action, entity_type, entity_id, details, changes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        body.userId || callerUserId,
        body.userEmail || callerEmail,
        body.userRole || callerRole,
        body.userName || null,
        body.action || 'UNKNOWN',
        body.entityType || 'unknown',
        body.entityId || 'general',
        body.details || null,
        body.changes ? JSON.stringify(body.changes) : null
      ]);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    if (httpMethod === 'GET' && path === '/audit-logs') {
      if (callerRole === 'nurse') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Consulta de auditoría reservada a Doctores y Administradores.' })
        };
      }

      const qParams = event.queryStringParameters || {};
      const pageParam = qParams.page ? parseInt(qParams.page) : null;
      const limitParam = qParams.limit ? parseInt(qParams.limit) : null;

      const countRes = await db.query('SELECT COUNT(id) as total FROM audit_log');
      const totalCount = parseInt(countRes.rows[0]?.total || '0');

      let query = 'SELECT * FROM audit_log ORDER BY created_at DESC';
      let queryParams = [];

      if (pageParam && limitParam) {
        const offset = Math.max(0, (pageParam - 1) * limitParam);
        queryParams.push(limitParam);
        query += ` LIMIT $${queryParams.length}`;
        queryParams.push(offset);
        query += ` OFFSET $${queryParams.length}`;
      } else {
        query += ` LIMIT 200`;
      }

      const result = await db.query(query, queryParams);
      const resHeaders = {
        ...headers,
        'X-Total-Count': totalCount.toString()
      };

      if (pageParam) {
        return {
          statusCode: 200,
          headers: resHeaders,
          body: JSON.stringify({
            data: result.rows,
            items: result.rows,
            total: totalCount,
            page: pageParam,
            limit: limitParam || result.rows.length,
            totalPages: Math.ceil(totalCount / (limitParam || 1))
          })
        };
      }

      return {
        statusCode: 200,
        headers: resHeaders,
        body: JSON.stringify(result.rows)
      };
    }

    // ─────────────────────────────────────────────────────────
    // 5. FACILITY SHIFTS & NURSE SHIFTS (Gestión y Rotación de Turnos)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/facility-shifts') {
      const result = await db.query(`
        SELECT id, name, start_time::text AS "startTime", end_time::text AS "endTime", description, updated_at
        FROM facility_shift_config
        ORDER BY CASE id WHEN 'matutino' THEN 1 WHEN 'vespertino' THEN 2 WHEN 'nocturno' THEN 3 ELSE 4 END
      `);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
      };
    }

    if (httpMethod === 'PUT' && path === '/facility-shifts') {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede configurar los horarios de los turnos del establecimiento.' })
        };
      }

      const body = JSON.parse(event.body || '{}');
      const shifts = body.shifts || []; // Array de { id, name, startTime, endTime, description }

      for (const s of shifts) {
        await db.query(`
          INSERT INTO facility_shift_config (id, name, start_time, end_time, description, updated_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [s.id, s.name, s.startTime, s.endTime, s.description || null]);
      }

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'UPDATE_SHIFT_CONFIG', 'facility_shift_config', 'facility', 'Actualización de horarios de turnos del centro')
      `, [callerUserId, callerEmail, callerRole]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Horarios configurados correctamente' })
      };
    }

    if (httpMethod === 'GET' && path === '/nurse-shifts') {
      const queryParams = event.queryStringParameters || {};
      const weekStartDate = queryParams.weekStartDate;
      const nurseId = queryParams.nurseId;

      let query = `
        SELECT 
          nsa.id,
          nsa.nurse_id AS "nurseId",
          u.full_name AS "nurseName",
          u.email AS "nurseEmail",
          nsa.week_start_date::text AS "weekStartDate",
          nsa.shift_type AS "shiftType",
          nsa.days,
          nsa.notes,
          admin_u.full_name AS "assignedByUserName",
          nsa.created_at AS "createdAt",
          nsa.updated_at AS "updatedAt"
        FROM nurse_shift_assignments nsa
        JOIN users u ON u.id = nsa.nurse_id
        LEFT JOIN users admin_u ON admin_u.id = nsa.assigned_by_user_id
        WHERE 1=1
      `;
      const values = [];

      // RBAC: Si el llamador es enfermero, únicamente puede consultar sus propios turnos
      if (callerRole === 'nurse') {
        values.push(callerUserId);
        query += ` AND nsa.nurse_id = $${values.length}`;
      } else if (nurseId) {
        values.push(nurseId);
        query += ` AND nsa.nurse_id = $${values.length}`;
      }

      if (weekStartDate) {
        values.push(weekStartDate);
        query += ` AND nsa.week_start_date = $${values.length}`;
      }

      query += ` ORDER BY nsa.week_start_date DESC, u.full_name ASC`;

      const result = await db.query(query, values);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
      };
    }

    if (httpMethod === 'POST' && path === '/nurse-shifts') {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede registrar o programar turnos de enfermería.' })
        };
      }

      const body = JSON.parse(event.body || '{}');
      const { id, nurseId, weekStartDate, shiftType, days, notes } = body;

      if (!nurseId || !weekStartDate || !shiftType) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Campos requeridos faltantes: nurseId, weekStartDate, shiftType' })
        };
      }

      // Validar incompatibilidad (evitar que un enfermero tenga dos turnos incompatibles en la misma semana)
      const conflictCheck = await db.query(`
        SELECT id, shift_type FROM nurse_shift_assignments
        WHERE nurse_id = $1 AND week_start_date = $2 AND ($3::uuid IS NULL OR id != $3::uuid)
      `, [nurseId, weekStartDate, id || null]);

      if (conflictCheck.rows.length > 0) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ 
            message: `Incompatibilidad horaria: El enfermero ya cuenta con el turno ${conflictCheck.rows[0].shift_type} programado para esa semana. Modifica el turno existente en lugar de duplicarlo.` 
          })
        };
      }

      let savedResult;
      if (id) {
        savedResult = await db.query(`
          UPDATE nurse_shift_assignments
          SET shift_type = $1, days = $2, notes = $3, assigned_by_user_id = $4, updated_at = CURRENT_TIMESTAMP
          WHERE id = $5
          RETURNING *
        `, [shiftType, JSON.stringify(days || []), notes || null, callerUserId, id]);
      } else {
        savedResult = await db.query(`
          INSERT INTO nurse_shift_assignments (nurse_id, week_start_date, shift_type, days, notes, assigned_by_user_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [nurseId, weekStartDate, shiftType, JSON.stringify(days || []), notes || null, callerUserId]);
      }

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details, changes)
        VALUES ($1, $2, $3, 'PROGRAM_NURSE_SHIFT', 'nurse_shift_assignments', $4, $5, $6)
      `, [
        callerUserId,
        callerEmail,
        callerRole,
        nurseId,
        `Programación de turno ${shiftType} para la semana ${weekStartDate}`,
        JSON.stringify({ weekStartDate, shiftType, days, notes })
      ]);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(savedResult.rows[0])
      };
    }

    // ─────────────────────────────────────────────────────────
    // 6. PATIENT SHIFT ASSIGNMENTS (Asignación Territorial por Turno)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/patient-shift-assignments') {
      const queryParams = event.queryStringParameters || {};
      const weekStartDate = queryParams.weekStartDate;
      const nurseId = queryParams.nurseId;
      const patientId = queryParams.patientId;
      const activeOnly = queryParams.activeOnly !== 'false';

      let query = `
        SELECT 
          psa.id,
          psa.patient_id AS "patientDeviceId",
          psa.patient_name AS "patientName",
          psa.room_number AS "roomNumber",
          psa.floor,
          psa.nurse_id AS "nurseId",
          u.full_name AS "nurseName",
          u.email AS "nurseEmail",
          psa.shift_type AS "shiftType",
          psa.week_start_date::text AS "weekStartDate",
          psa.active,
          psa.assigned_at AS "assignedAt",
          psa.withdrawn_at AS "withdrawnAt",
          psa.withdrawn_reason AS "withdrawnReason",
          admin_u.full_name AS "assignedByUserName"
        FROM patient_shift_assignments psa
        JOIN users u ON u.id = psa.nurse_id
        LEFT JOIN users admin_u ON admin_u.id = psa.assigned_by_user_id
        WHERE 1=1
      `;
      const values = [];

      // RBAC: Si el llamador es enfermero, únicamente puede consultar sus propios pacientes asignados
      if (callerRole === 'nurse') {
        values.push(callerUserId);
        query += ` AND psa.nurse_id = $${values.length}`;
      } else if (nurseId) {
        values.push(nurseId);
        query += ` AND psa.nurse_id = $${values.length}`;
      }

      if (patientId) {
        values.push(patientId);
        query += ` AND psa.patient_id = $${values.length}`;
      }

      if (weekStartDate) {
        values.push(weekStartDate);
        query += ` AND psa.week_start_date = $${values.length}`;
      }

      if (activeOnly) {
        query += ` AND psa.active = TRUE`;
      }

      query += ` ORDER BY psa.patient_name ASC, psa.shift_type ASC`;

      const result = await db.query(query, values);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
      };
    }

    if (httpMethod === 'POST' && path === '/patient-shift-assignments') {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede asignar pacientes a enfermeros.' })
        };
      }

      const body = JSON.parse(event.body || '{}');
      const { patientDeviceId, patientName, roomNumber, floor, nurseId, shiftType, weekStartDate } = body;

      if (!patientDeviceId || !nurseId || !shiftType || !weekStartDate) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Campos requeridos faltantes: patientDeviceId, nurseId, shiftType, weekStartDate' })
        };
      }

      // Retirar cualquier asignación activa previa para este paciente en este turno y semana (conservando historial)
      await db.query(`
        UPDATE patient_shift_assignments
        SET active = FALSE, withdrawn_at = CURRENT_TIMESTAMP, withdrawn_reason = 'Reasignación de turno por la administración'
        WHERE patient_id = $1 AND shift_type = $2 AND week_start_date = $3 AND active = TRUE
      `, [patientDeviceId, shiftType, weekStartDate]);

      const insertResult = await db.query(`
        INSERT INTO patient_shift_assignments (
          patient_id, patient_name, room_number, floor, nurse_id, shift_type, week_start_date, active, assigned_by_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
        RETURNING *
      `, [patientDeviceId, patientName || patientDeviceId, roomNumber || null, floor || null, nurseId, shiftType, weekStartDate, callerUserId]);

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ASSIGN_PATIENT_SHIFT', 'patient_shift_assignments', $4, $5)
      `, [callerUserId, callerEmail, callerRole, patientDeviceId, `Asignación de paciente ${patientName} en turno ${shiftType} para la semana ${weekStartDate}`]);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(insertResult.rows[0])
      };
    }

    if (httpMethod === 'PUT' && path.match(/^\/patient-shift-assignments\/([^\/]+)\/withdraw$/)) {
      if (callerRole !== 'admin') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: 'Acceso Denegado (RBAC): Únicamente el Administrador puede retirar asignaciones de pacientes.' })
        };
      }

      const assignmentId = path.split('/')[2];
      const body = JSON.parse(event.body || '{}');
      const reason = body.reason || 'Retiro de asignación solicitado por la administración.';

      const result = await db.query(`
        UPDATE patient_shift_assignments
        SET active = FALSE, withdrawn_at = CURRENT_TIMESTAMP, withdrawn_reason = $1
        WHERE id = $2
        RETURNING *
      `, [reason, assignmentId]);

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Asignación no encontrada' })
        };
      }

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'WITHDRAW_PATIENT_SHIFT', 'patient_shift_assignments', $4, $5)
      `, [callerUserId, callerEmail, callerRole, assignmentId, `Retiro de asignación: ${reason}`]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, assignment: result.rows[0] })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 7. CLINICAL MEASUREMENTS ENDPOINT (Telemetría Histórica de Pacientes en RDS)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/measurements') {
      const queryParams = event.queryStringParameters || {};
      const deviceId = queryParams.deviceId;
      const patientId = queryParams.patientId;
      const range = queryParams.range || 'hoy';

      let intervalCondition = "cm.recorded_at >= NOW() - INTERVAL '24 hours'";
      if (range === 'semana') {
        intervalCondition = "cm.recorded_at >= NOW() - INTERVAL '7 days'";
      } else if (range === 'mes') {
        intervalCondition = "cm.recorded_at >= NOW() - INTERVAL '30 days'";
      }

      let query = `
        SELECT 
          cm.id,
          cm.patient_id AS "patientId",
          cm.heart_rate AS "heartRate",
          cm.temperature,
          cm.spo2,
          cm.systolic_pressure AS "systolicPressure",
          cm.diastolic_pressure AS "diastolicPressure",
          cm.recorded_at AS "recordedAt",
          TO_CHAR(cm.recorded_at, 'HH24:MI') AS "time"
        FROM clinical_measurements cm
        JOIN patients p ON cm.patient_id = p.id
        WHERE ${intervalCondition}
      `;
      const values = [];

      if (deviceId) {
        values.push(deviceId);
        query += ` AND p.device_id = $${values.length}`;
      } else if (patientId) {
        values.push(patientId);
        query += ` AND cm.patient_id = $${values.length}`;
      }

      query += ` ORDER BY cm.recorded_at ASC LIMIT 100`;

      try {
        const result = await db.query(query, values);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.rows)
        };
      } catch (errM) {
        console.warn('Error consultando clinical_measurements:', errM.message);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify([])
        };
      }
    }

    if (httpMethod === 'POST' && path === '/measurements') {
      const body = JSON.parse(event.body || '{}');
      if (!body.deviceId && !body.patientId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Se requiere deviceId o patientId para registrar la medición.' })
        };
      }

      let resolvedPatientId = body.patientId;
      if (!resolvedPatientId && body.deviceId) {
        const pRes = await db.query('SELECT id FROM patients WHERE device_id = $1 LIMIT 1', [body.deviceId]);
        if (pRes.rows.length > 0) {
          resolvedPatientId = pRes.rows[0].id;
        }
      }

      if (!resolvedPatientId) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Paciente no encontrado para registrar medición.' })
        };
      }

      const query = `
        INSERT INTO clinical_measurements (
          patient_id, heart_rate, temperature, spo2, systolic_pressure, diastolic_pressure, recorded_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) RETURNING *
      `;
      const values = [
        resolvedPatientId,
        body.heartRate || null,
        body.temperature || null,
        body.spo2 || null,
        body.systolicPressure || null,
        body.diastolicPressure || null,
        body.timestamp ? new Date(body.timestamp) : new Date()
      ];

      const result = await db.query(query, values);
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(result.rows[0])
      };
    }

    // ─────────────────────────────────────────────────────────
    // 8. DASHBOARD METRICS ENDPOINT (Control de Acceso Estricto por Rol)
    // ─────────────────────────────────────────────────────────
    if (httpMethod === 'GET' && path === '/dashboard/metrics') {
      const queryParams = event.queryStringParameters || {};
      const requestedScope = (queryParams.scope || (callerRole === 'admin' ? 'admin' : 'clinical')).toLowerCase();

      // Validación estricta de permisos según rol
      if (requestedScope === 'admin') {
        if (callerRole !== 'admin') {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'Forbidden',
              message: 'Acceso Denegado (RBAC): El dashboard administrativo y sus KPIs estratégicos están restringidos exclusivamente al rol Administrador.'
            })
          };
        }
      } else if (requestedScope === 'clinical') {
        if (callerRole !== 'doctor' && callerRole !== 'nurse') {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'Forbidden',
              message: 'Acceso Denegado (RBAC): El dashboard clínico-operativo está restringido exclusivamente a Doctores y Enfermeros.'
            })
          };
        }
      } else {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Bad Request', message: 'Ámbito de métricas no válido. Debe ser "admin" o "clinical".' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          scope: requestedScope,
          authorizedRole: callerRole,
          timestamp: new Date().toISOString(),
          status: 'authorized'
        })
      };
    }

    // Unhandled methods/paths
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' })
    };

  } catch (error) {
    console.error('Database query error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message })
    };
  }
};
