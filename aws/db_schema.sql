-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Esquema Maestro Consolidado de Base de Datos Relacional v8.0
-- Diseñado para Amazon Aurora PostgreSQL / PostgreSQL 14+
-- Incluye:
-- 1. Control de Acceso Basado en Roles (RBAC: Admin, Doctor, Enfermero).
-- 2. Cuentas de Personal y Auditoría de Suspensión Administrativa.
-- 3. Expediente de Pacientes con Archivado Asistencial y Ubicación Hospitalaria.
-- 4. Brazaletes Hardware IoT Desacoplados (con estados 'DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'NO_EN_USO').
--    (Excepción aplicada: Se omitieron 'model' y 'battery_level' de la tabla bracelets según requerimiento).
-- 5. Umbrales Clínicos Personalizados y Calibración Médica.
-- 6. Historial de Telemetría y Constantes Vitales (Preservación histórica sin destrucción en cascada).
-- 7. Configuración de Horarios del Centro y Programación Semanal de Turnos de Enfermería.
-- 8. Asignación Territorial de Pacientes por Turno (hasta 3 enfermeros por paciente).
-- 9. Sistema de Tickets Clínicos, Bitácora Inmutable de Notas, Entregas de Turno (Transfers) y Trazabilidad.
-- 10. Bitácora General de Auditoría Administrativa y Clínica (audit_log).
-- ──────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────
-- 1. TABLA: roles
-- Catálogo de roles para control de acceso RBAC
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(255)
);

INSERT INTO roles (id, name, description) VALUES
('admin', 'Administrador', 'Control integral del sistema, gestión de usuarios, roles, programación de turnos y centro'),
('doctor', 'Doctor / Médico', 'Lectura clínica avanzada, diagnóstico, historial acumulado y calibración de umbrales clínicos'),
('nurse', 'Enfermero / Personal Asistencial', 'Consulta de pacientes, atención de alertas, registro de notas de bitácora y entregas de turno')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- ──────────────────────────────────────────────────────────────────────
-- 2. TABLA: facility_shift_config
-- Horarios institucionales de referencia por turno (Configurable por Administrador)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facility_shift_config (
    id VARCHAR(20) PRIMARY KEY, -- 'matutino', 'vespertino', 'nocturno'
    name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description VARCHAR(150),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO facility_shift_config (id, name, start_time, end_time, description) VALUES
('matutino', 'Matutino', '07:00:00', '15:00:00', 'Turno matutino habitual de atención clínica'),
('vespertino', 'Vespertino', '15:00:00', '23:00:00', 'Turno vespertino habitual de seguimiento'),
('nocturno', 'Nocturno', '23:00:00', '07:00:00', 'Turno nocturno / velada de supervisión')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    description = EXCLUDED.description;

-- ──────────────────────────────────────────────────────────────────────
-- 3. TABLA: users
-- Cuentas de usuario del personal asistencial y administrativo
-- Soporta suspensión de cuenta con registro de motivo y responsable.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id VARCHAR(20) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
    email VARCHAR(120) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    default_shift VARCHAR(20) DEFAULT 'matutino' REFERENCES facility_shift_config(id) ON UPDATE CASCADE ON DELETE SET NULL,
    suspended_at TIMESTAMP WITH TIME ZONE,
    suspended_by VARCHAR(150),
    suspended_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    suspended_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_users_suspended_at ON users (suspended_at);

-- ──────────────────────────────────────────────────────────────────────
-- 4. TABLA: patients
-- Expediente personal y médico básico del adulto mayor (independiente del hardware)
-- Soporta archivado (baja/alta asistencial) con conservación histórica íntegra.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    birth_date DATE,
    gender VARCHAR(20) CHECK (gender IN ('Hombre', 'Mujer')),
    height_cm NUMERIC(5, 2) CHECK (height_cm IS NULL OR (height_cm > 0 AND height_cm < 280)),
    weight_kg NUMERIC(5, 2) CHECK (weight_kg IS NULL OR (weight_kg > 0 AND weight_kg < 400)),
    room_number VARCHAR(20),
    floor VARCHAR(20),
    bed_number VARCHAR(20),
    assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL,
    medical_notes TEXT,
    contact_name VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    archived_at TIMESTAMP WITH TIME ZONE,
    archived_by VARCHAR(150),
    archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    archived_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients (LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_patients_is_active ON patients (is_active);
CREATE INDEX IF NOT EXISTS idx_patients_is_archived ON patients (is_archived);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_nurse ON patients (assigned_nurse_id);
CREATE INDEX IF NOT EXISTS idx_patients_location ON patients (floor, room_number);

-- ──────────────────────────────────────────────────────────────────────
-- 5. TABLA: bracelets (Hardware IoT Desacoplado)
-- Admite estados 'DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'NO_EN_USO'
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bracelets (
    device_id VARCHAR(50) PRIMARY KEY,
    patient_id UUID UNIQUE REFERENCES patients(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE' CHECK (status IN ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'NO_EN_USO')),
    assigned_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bracelets_patient_id ON bracelets (patient_id);
CREATE INDEX IF NOT EXISTS idx_bracelets_status ON bracelets (status);

-- ──────────────────────────────────────────────────────────────────────
-- 6. TABLA: patient_thresholds
-- Calibración médica personalizada de alertas por paciente
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_thresholds (
    patient_id UUID PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
    hr_min INT NOT NULL DEFAULT 50 CHECK (hr_min > 30),
    hr_max INT NOT NULL DEFAULT 110 CHECK (hr_max > hr_min),
    temp_min NUMERIC(4, 2) NOT NULL DEFAULT 35.50 CHECK (temp_min > 30.00),
    temp_max NUMERIC(4, 2) NOT NULL DEFAULT 38.00 CHECK (temp_max > temp_min),
    fall_alert_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notifications_active BOOLEAN NOT NULL DEFAULT TRUE,
    watch_theme VARCHAR(20) DEFAULT 'dark',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────────────
-- 7. TABLA: clinical_measurements
-- Historial cronológico de constantes vitales (telemetría IoT y simulada)
-- Preservación histórica: Desvincular un brazalete NO elimina las mediciones.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_measurements (
    id BIGSERIAL PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(50) REFERENCES bracelets(device_id) ON DELETE SET NULL,
    heart_rate INT NOT NULL CHECK (heart_rate >= 0),
    temperature NUMERIC(4, 2) NOT NULL CHECK (temperature >= 20.00 AND temperature <= 45.00),
    fall_detected BOOLEAN NOT NULL DEFAULT FALSE,
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    battery_level INT,
    accel_x NUMERIC(5, 2),
    accel_y NUMERIC(5, 2),
    accel_z NUMERIC(5, 2),
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_measurements_patient_time ON clinical_measurements (patient_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_device_time ON clinical_measurements (device_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_simulated ON clinical_measurements (is_simulated);

-- ──────────────────────────────────────────────────────────────────────
-- 8. TABLA: nurse_shift_assignments
-- Programación semanal y rotaciones de turnos de enfermeros
-- Preserva histórico: RESTRICT impide borrado accidental de historial de turnos.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nurse_shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nurse_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    week_start_date DATE NOT NULL,
    shift_type VARCHAR(20) NOT NULL REFERENCES facility_shift_config(id) ON UPDATE CASCADE,
    days JSONB DEFAULT '["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]'::jsonb,
    notes TEXT,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_nurse_week UNIQUE (nurse_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_nurse_shifts_nurse ON nurse_shift_assignments (nurse_id);
CREATE INDEX IF NOT EXISTS idx_nurse_shifts_week ON nurse_shift_assignments (week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_nurse_shifts_type ON nurse_shift_assignments (shift_type);

-- ──────────────────────────────────────────────────────────────────────
-- 9. TABLA: patient_shift_assignments
-- Asignación territorial de pacientes a enfermeros por turno
-- Un paciente puede tener hasta 3 enfermeros asignados (uno por turno).
-- Un enfermero puede tener múltiples pacientes a cargo.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id VARCHAR(50) NOT NULL, -- Compatibilidad con identificador de hardware / frontend
    patient_uuid UUID REFERENCES patients(id) ON DELETE SET NULL, -- Enlace relacional estricto
    patient_name VARCHAR(150) NOT NULL,
    room_number VARCHAR(50),
    floor VARCHAR(50),
    nurse_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shift_type VARCHAR(20) NOT NULL REFERENCES facility_shift_config(id) ON UPDATE CASCADE,
    week_start_date DATE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawn_reason TEXT,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_shift_week_active 
ON patient_shift_assignments (patient_id, shift_type, week_start_date)
WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_psa_nurse ON patient_shift_assignments (nurse_id, active);
CREATE INDEX IF NOT EXISTS idx_psa_patient ON patient_shift_assignments (patient_id, active);
CREATE INDEX IF NOT EXISTS idx_psa_patient_uuid ON patient_shift_assignments (patient_uuid);
CREATE INDEX IF NOT EXISTS idx_psa_week ON patient_shift_assignments (week_start_date);
CREATE INDEX IF NOT EXISTS idx_psa_shift ON patient_shift_assignments (shift_type);

-- ──────────────────────────────────────────────────────────────────────
-- 10. TABLA: alerts
-- Eventos clínicos y técnicos clasificados por criticidad
-- Preservación histórica: Desvincular brazalete NO elimina las alertas.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio VARCHAR(30),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(50) REFERENCES bracelets(device_id) ON DELETE SET NULL,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(200),
    criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (LOWER(criticality) IN ('baja', 'media', 'alta', 'critica')),
    clinical_value VARCHAR(150),
    shift_type VARCHAR(20),
    message TEXT NOT NULL,
    current_status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (current_status IN ('PENDIENTE', 'EN_ATENCION', 'ATENDIDA')),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_folio ON alerts (folio);
CREATE INDEX IF NOT EXISTS idx_alerts_patient_status ON alerts (patient_id, current_status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_nurse ON alerts (assigned_nurse_id);

-- ──────────────────────────────────────────────────────────────────────
-- 11. TABLA: alert_tracking
-- Bitácora complementaria de seguimiento de alertas clínicas
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_tracking (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status_changed_to VARCHAR(20) NOT NULL CHECK (status_changed_to IN ('EN_ATENCION', 'ATENDIDA')),
    action_notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_tracking_alert_id ON alert_tracking (alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_tracking_user_id ON alert_tracking (user_id);

-- ──────────────────────────────────────────────────────────────────────
-- 12. TABLA: notifications
-- Registro de avisos y notificaciones clínicas enviadas al personal
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_phone VARCHAR(30) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'SMS' CHECK (channel IN ('SMS', 'WHATSAPP', 'PUSH')),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (delivery_status IN ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'FALLIDO')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_alert_id ON notifications (alert_id);

-- ──────────────────────────────────────────────────────────────────────
-- 13. SISTEMA DE TICKETS DE ALERTAS CLÍNICAS (v6.0 - v8.0)
-- Gestión de incidentes con folio único, criticidad y ciclo de vida formal.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio VARCHAR(30) NOT NULL UNIQUE,
    alert_id VARCHAR(100),
    patient_id VARCHAR(50) NOT NULL,
    patient_uuid UUID REFERENCES patients(id) ON DELETE SET NULL,
    patient_name VARCHAR(150) NOT NULL,
    room_number VARCHAR(50),
    floor VARCHAR(50),
    device_id VARCHAR(50) NOT NULL,
    alert_type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    clinical_value VARCHAR(150),
    criticality VARCHAR(20) NOT NULL CHECK (LOWER(criticality) IN ('baja', 'media', 'alta', 'critica')),
    shift_type VARCHAR(20) NOT NULL CHECK (shift_type IN ('matutino', 'vespertino', 'nocturno')),
    status VARCHAR(20) NOT NULL DEFAULT 'recibido' CHECK (status IN ('recibido', 'en_progreso', 'completado')),
    assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_nurse_name VARCHAR(150),
    is_unassigned BOOLEAN NOT NULL DEFAULT FALSE,
    original_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_nurse_name VARCHAR(150),
    resolution_notes TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tickets_folio ON tickets (folio);
CREATE INDEX IF NOT EXISTS idx_tickets_patient ON tickets (patient_id);
CREATE INDEX IF NOT EXISTS idx_tickets_patient_uuid ON tickets (patient_uuid);
CREATE INDEX IF NOT EXISTS idx_tickets_nurse ON tickets (assigned_nurse_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_criticality ON tickets (criticality);
CREATE INDEX IF NOT EXISTS idx_tickets_shift ON tickets (shift_type);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);

-- Bitácora inmutable de notas clínicas
CREATE TABLE IF NOT EXISTS ticket_notes (
    id BIGSERIAL PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    user_name VARCHAR(150) NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    note_text TEXT NOT NULL,
    note_type VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'resolucion', 'transferencia')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket_id ON ticket_notes (ticket_id, created_at ASC);

-- Historial formal de entregas de turno (handoff)
CREATE TABLE IF NOT EXISTS ticket_transfers (
    id BIGSERIAL PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    from_nurse_id UUID NOT NULL REFERENCES users(id),
    from_nurse_name VARCHAR(150) NOT NULL,
    to_nurse_id UUID NOT NULL REFERENCES users(id),
    to_nurse_name VARCHAR(150) NOT NULL,
    to_shift_type VARCHAR(20) NOT NULL CHECK (to_shift_type IN ('matutino', 'vespertino', 'nocturno')),
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_transfers_ticket_id ON ticket_transfers (ticket_id);

-- Línea de tiempo de auditoría y ciclo de vida de tickets
CREATE TABLE IF NOT EXISTS ticket_activity (
    id BIGSERIAL PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREADO', 'ASIGNADO', 'EN_PROGRESO', 'NOTA_AGREGADA', 'TRANSFERENCIA', 'COMPLETADO', 'REASIGNADO', 'ACTUALIZADO')),
    description TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    user_role VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket_id ON ticket_activity (ticket_id, created_at ASC);

-- ──────────────────────────────────────────────────────────────────────
-- 14. TABLA: audit_log
-- Bitácora general de trazabilidad para modificaciones administrativas y clínicas
-- ──────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_role ON audit_log (user_role);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (user_email, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- FUNCIONES Y TRIGGERS DE ACTUALIZACIÓN AUTOMÁTICA
-- ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_patient_thresholds_updated_at
    BEFORE UPDATE ON patient_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_nurse_shifts_updated_at
    BEFORE UPDATE ON nurse_shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_patient_shifts_updated_at
    BEFORE UPDATE ON patient_shift_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

CREATE OR REPLACE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();

-- ──────────────────────────────────────────────────────────────────────
-- DATOS SEMILLA INICIALES
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO users (id, role_id, email, full_name, phone_number, is_active, default_shift) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin', 'admin@healthnet.com', 'Lic. Laura Martínez', '+52 664 123 4567', TRUE, 'matutino'),
('a0000000-0000-0000-0000-000000000002', 'doctor', 'doctor@healthnet.com', 'Dr. Roberto Sánchez', '+52 664 234 5678', TRUE, 'matutino'),
('a0000000-0000-0000-0000-000000000003', 'nurse', 'enfermero@healthnet.com', 'Enf. Carlos Domínguez', '+52 664 345 6789', TRUE, 'matutino'),
('a0000000-0000-0000-0000-000000000004', 'nurse', 'ana.ruiz@healthnet.com', 'Lic. Ana Ruiz Morales', '+52 664 456 7890', TRUE, 'vespertino'),
('a0000000-0000-0000-0000-000000000005', 'nurse', 'elena.soto@healthnet.com', 'Lic. Elena Soto Vargas', '+52 664 567 8901', TRUE, 'nocturno')
ON CONFLICT (email) DO NOTHING;
