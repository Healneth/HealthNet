-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Esquema de Base de Datos Relacional v2.0
-- Diseñado para Aurora PostgreSQL / PostgreSQL 14+
-- Soporta RBAC (Roles), Pacientes, Brazaletes (desacoplados),
-- Mediciones telemétricas, Alertas con Criticidad, Tickets y Notificaciones.
--
-- NOTA DE DISEÑO (Excepción explícita):
-- En la tabla 'bracelets' se omitieron deliberadamente los campos
-- 'model' y 'battery_level' por especificación funcional.
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
('admin', 'Administrador', 'Control integral del sistema, gestión de usuarios, roles y centro'),
('doctor', 'Doctor / Médico', 'Lectura clínica avanzada, diagnóstico, historial acumulado y umbrales'),
('nurse', 'Enfermero / Personal Asistencial', 'Consulta general de pacientes, gestión de alertas y registro de bitácora')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- ──────────────────────────────────────────────────────────────────────
-- 2. TABLA: users
-- Cuentas de usuario del personal médico y administrativo
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id VARCHAR(20) NOT NULL REFERENCES roles(id) ON UPDATE CASCADE,
    email VARCHAR(120) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (LOWER(email));

-- ──────────────────────────────────────────────────────────────────────
-- 3. TABLA: patients
-- Ficha personal y médica básica del adulto mayor (independiente del hardware)
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
    assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL,
    medical_notes TEXT,
    contact_name VARCHAR(100) NOT NULL,
    contact_phone VARCHAR(30) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_patients_full_name ON patients (LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_patients_is_active ON patients (is_active);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_nurse ON patients (assigned_nurse_id);

-- ──────────────────────────────────────────────────────────────────────
-- 4. TABLA: bracelets (Hardware IoT)
-- ASOCIACIÓN DESACOPLADA DE HARDWARE CON PACIENTE
--
-- Excepción aplicada: Se omiten 'model' y 'battery_level' según requerimiento.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bracelets (
    device_id VARCHAR(50) PRIMARY KEY,
    patient_id UUID UNIQUE REFERENCES patients(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE' CHECK (status IN ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO')),
    assigned_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_bracelets_patient_id ON bracelets (patient_id);
CREATE INDEX IF NOT EXISTS idx_bracelets_status ON bracelets (status);

-- ──────────────────────────────────────────────────────────────────────
-- 5. TABLA: patient_thresholds
-- Umbrales clínicos personalizados por paciente
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
-- 6. TABLA: clinical_measurements
-- Historial cronológico de constantes vitales (telemetría con flag de simulación)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_measurements (
    id BIGSERIAL PRIMARY KEY,
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(50) NOT NULL REFERENCES bracelets(device_id) ON DELETE CASCADE,
    heart_rate INT NOT NULL CHECK (heart_rate >= 0),
    temperature NUMERIC(4, 2) NOT NULL CHECK (temperature >= 20.00 AND temperature <= 45.00),
    fall_detected BOOLEAN NOT NULL DEFAULT FALSE,
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_measurements_patient_time ON clinical_measurements (patient_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_simulated ON clinical_measurements (is_simulated);

-- ──────────────────────────────────────────────────────────────────────
-- 7. TABLA: alerts
-- Eventos clínicos y técnicos clasificados por criticidad
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    device_id VARCHAR(50) NOT NULL REFERENCES bracelets(device_id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIA' CHECK (criticality IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
    message TEXT NOT NULL,
    current_status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (current_status IN ('PENDIENTE', 'EN_ATENCION', 'ATENDIDA')),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_patient_status ON alerts (patient_id, current_status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 8. TABLA: alert_tracking
-- Bitácora de seguimiento tipo ticket de atención (Enfermeros / Médicos)
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
-- 9. TABLA: notifications
-- Registro de avisos enviados a teléfonos móviles del personal médico
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id),
    recipient_phone VARCHAR(30) NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'SMS' CHECK (channel IN ('SMS', 'WHATSAPP', 'PUSH')),
    delivery_status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (delivery_status IN ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'FALLIDO')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_alert_id ON notifications (alert_id);

-- ──────────────────────────────────────────────────────────────────────
-- FUNCIONES Y TRIGGERS DE AUDITORÍA
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

-- ──────────────────────────────────────────────────────────────────────
-- 10. TABLA: audit_log
-- Bitácora de auditoría para trazabilidad de modificaciones clínicas y administrativas
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
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 11. SISTEMA DE TICKETS DE ALERTAS CLÍNICAS (v6.0)
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folio VARCHAR(30) NOT NULL UNIQUE,
    alert_id VARCHAR(100),
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    room_number VARCHAR(50),
    floor VARCHAR(50),
    device_id VARCHAR(50) NOT NULL,
    alert_type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    clinical_value VARCHAR(150),
    criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('baja', 'media', 'alta', 'critica')),
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

CREATE TABLE IF NOT EXISTS ticket_activity (
    id BIGSERIAL PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREADO', 'ASIGNADO', 'EN_PROGRESO', 'NOTA_AGREGADA', 'TRANSFERENCIA', 'COMPLETADO')),
    description TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    user_role VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────────────────────────────
-- DATOS SEMILLA INICIALES (Usuarios por defecto para pruebas y arranque)
-- ──────────────────────────────────────────────────────────────────────
INSERT INTO users (id, role_id, email, full_name, phone_number, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin', 'admin@healthnet.com', 'Lic. Laura Martínez', '+52 664 123 4567', TRUE),
('a0000000-0000-0000-0000-000000000002', 'doctor', 'doctor@healthnet.com', 'Dr. Roberto Sánchez', '+52 664 234 5678', TRUE),
('a0000000-0000-0000-0000-000000000003', 'nurse', 'enfermero@healthnet.com', 'Enf. Carlos Domínguez', '+52 664 345 6789', TRUE)
ON CONFLICT (email) DO NOTHING;
