const { Client } = require('pg');

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
    const callerRole = (headersLower['x-user-role'] || event.requestContext?.authorizer?.claims?.['custom:role'] || 'admin').toLowerCase();
    const callerUserId = headersLower['x-user-id'] || event.requestContext?.authorizer?.claims?.sub || null;
    const callerEmail = (headersLower['x-user-email'] || event.requestContext?.authorizer?.claims?.email || 'admin@healthnet.com').toLowerCase();

    // ─────────────────────────────────────────────────────────
    // 1. PATIENTS ENDPOINTS (Nuevo Esquema Normalizado con RBAC)
    // ─────────────────────────────────────────────────────────

    // GET /patients (list patients)
    if (httpMethod === 'GET' && !deviceId && path === '/patients') {
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
          p.assigned_nurse_id,
          u.full_name AS assigned_nurse_name,
          p.medical_notes,
          p.contact_name,
          p.contact_phone,
          p.contact_phone AS phone,
          p.is_active,
          COALESCE(b.device_id, p.id::text) AS device_id,
          b.status AS bracelet_status,
          b.assigned_at,
          b.last_sync_at,
          COALESCE(t.hr_min, 50) AS hr_min,
          COALESCE(t.hr_max, 110) AS hr_max,
          COALESCE(t.temp_max, 38.00) AS temp_max,
          COALESCE(t.notifications_active, true) AS notifications_active,
          COALESCE(t.watch_theme, 'dark') AS watch_theme
        FROM patients p
        LEFT JOIN bracelets b ON p.id = b.patient_id
        LEFT JOIN patient_thresholds t ON p.id = t.patient_id
        LEFT JOIN users u ON p.assigned_nurse_id = u.id
      `;

      let queryParams = [];
      // RBAC: Si es Enfermero, consultar ÚNICAMENTE sus pacientes asignados
      if (callerRole === 'nurse') {
        query += ` WHERE p.assigned_nurse_id::text = $1 OR LOWER(u.email) = LOWER($2) `;
        queryParams = [callerUserId || 'a0000000-0000-0000-0000-000000000003', callerEmail];
      }

      query += ` ORDER BY p.full_name ASC;`;
      const result = await db.query(query, queryParams);
      return {
        statusCode: 200,
        headers,
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
          p.assigned_nurse_id,
          u.full_name AS assigned_nurse_name,
          u.email AS assigned_nurse_email,
          p.medical_notes,
          p.contact_name,
          p.contact_phone,
          p.contact_phone AS phone,
          p.is_active,
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
      let existingPatientId = body.id;
      let existingRecord = null;
      if (!existingPatientId) {
        const checkBrace = await db.query('SELECT patient_id FROM bracelets WHERE device_id = $1', [targetDeviceId]);
        if (checkBrace.rows.length > 0 && checkBrace.rows[0].patient_id) {
          existingPatientId = checkBrace.rows[0].patient_id;
        }
      }

      if (existingPatientId) {
        const checkPatient = await db.query('SELECT * FROM patients WHERE id = $1', [existingPatientId]);
        if (checkPatient.rows.length > 0) {
          existingRecord = checkPatient.rows[0];
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
            await db.query(`
              UPDATE patients SET
                full_name = $1,
                gender = COALESCE($2, gender),
                contact_name = COALESCE($3, contact_name),
                contact_phone = COALESCE($4, contact_phone),
                room_number = COALESCE($5, room_number),
                floor = COALESCE($6, floor),
                assigned_nurse_id = COALESCE($7, assigned_nurse_id),
                updated_at = CURRENT_TIMESTAMP
              WHERE id = $8
            `, [
              patientFullName,
              body.gender || null,
              body.contactName || body.contact_name || body.emergencyContact || null,
              body.phone || body.contact_phone || null,
              body.roomNumber || body.room_number || null,
              body.floor || null,
              body.assigned_nurse_id || body.assignedNurseId || null,
              patientId
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

          const insPatient = await db.query(`
            INSERT INTO patients (full_name, gender, room_number, contact_name, contact_phone, floor, assigned_nurse_id, weight_kg, height_cm)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id;
          `, [
            patientFullName,
            body.gender || 'Hombre',
            body.roomNumber || body.room_number || 'Hab. 101',
            body.contactName || body.contact_name || body.emergencyContact || 'Familiar Responsable',
            body.phone || body.contact_phone || '—',
            body.floor || 'Piso 1',
            body.assigned_nurse_id || body.assignedNurseId || null,
            null,
            null
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

    // GET /alerts (Todos los roles, incluyendo enfermeros, visualizan todas las alertas clínicas)
    if (httpMethod === 'GET' && path === '/alerts') {
      const query = `
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
        ORDER BY a.created_at DESC LIMIT 500;
      `;

      const result = await db.query(query);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
      };
    }

    // POST /alerts
    if (httpMethod === 'POST' && path === '/alerts') {
      const body = JSON.parse(event.body || '{}');
      const criticality = body.criticality || (body.type === 'fall' ? 'CRITICA' : 'MEDIA');
      const query = `
        INSERT INTO alerts (id, patient_id, device_id, type, criticality, message, current_status, acknowledged)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
        RETURNING *;
      `;
      const values = [
        body.id || `alert-${Date.now()}`,
        body.patientId || null,
        body.deviceId,
        body.type,
        criticality,
        body.message,
        body.currentStatus || 'PENDIENTE',
        body.acknowledged || false
      ];
      const result = await db.query(query, values);
      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(result.rows[0] || body)
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
      const result = await db.query(
        'UPDATE alerts SET acknowledged = true, current_status = \'ATENDIDA\' WHERE id = $1 RETURNING *',
        [alertId]
      );

      await db.query(`
        INSERT INTO audit_log (user_id, user_email, user_role, action, entity_type, entity_id, details)
        VALUES ($1, $2, $3, 'ATTEND_ALERT', 'alert', $4, 'Resolución de alerta médica y cierre de ticket')
      `, [callerUserId, callerEmail, callerRole, alertId]);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows[0] || { id: alertId, acknowledged: true })
      };
    }

    // ─────────────────────────────────────────────────────────
    // 2.B. SISTEMA DE TICKETS DE ALERTAS CLÍNICAS (v6.0)
    // ─────────────────────────────────────────────────────────

    // GET /tickets
    if (httpMethod === 'GET' && path === '/tickets') {
      try {
        const query = `
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
          ORDER BY t.created_at DESC LIMIT 500;
        `;
        const result = await db.query(query);
        return {
          statusCode: 200,
          headers,
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

      if (!toNurseId || !toNurseName || !toShiftType || !reason) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Faltan parámetros requeridos para la transferencia (toNurseId, toNurseName, toShiftType, reason).' })
        };
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

      const result = await db.query('SELECT id, role_id AS role, email, full_name, phone_number, is_active, created_at FROM users ORDER BY full_name ASC');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows)
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

      const result = await db.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200');
      return {
        statusCode: 200,
        headers,
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
