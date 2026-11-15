-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Script de Migración de Esquema: v1.0 -> v2.0
-- Ejecutar en bases de datos existentes para actualizar la estructura
-- respetando la omisión de 'model' y 'battery_level' en la tabla 'bracelets'.
-- ──────────────────────────────────────────────────────────────────────

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Crear catálogo de roles si no existe
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

-- 2. Crear tabla de usuarios
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

-- Insertar usuarios iniciales para pruebas RBAC
INSERT INTO users (id, role_id, email, full_name, phone_number, is_active) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin', 'admin@healthnet.com', 'Lic. Laura Martínez', '+52 664 123 4567', TRUE),
('a0000000-0000-0000-0000-000000000002', 'doctor', 'doctor@healthnet.com', 'Dr. Roberto Sánchez', '+52 664 234 5678', TRUE),
('a0000000-0000-0000-0000-000000000003', 'nurse', 'enfermero@healthnet.com', 'Enf. Carlos Domínguez', '+52 664 345 6789', TRUE)
ON CONFLICT (email) DO NOTHING;

-- 3. Crear tabla bracelets (SIN model ni battery_level)
CREATE TABLE IF NOT EXISTS bracelets (
    device_id VARCHAR(50) PRIMARY KEY,
    patient_id UUID UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'DISPONIBLE' CHECK (status IN ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO')),
    assigned_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE
);

-- Si la tabla bracelets ya existía con campos 'model' o 'battery_level', eliminarlos
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bracelets' AND column_name='model') THEN
        ALTER TABLE bracelets DROP COLUMN model;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bracelets' AND column_name='battery_level') THEN
        ALTER TABLE bracelets DROP COLUMN battery_level;
    END IF;
END $$;

-- 4. Migrar tabla patients (si tenía device_id como PK)
DO $$
BEGIN
    -- Si la tabla patients tiene device_id como columna y no tiene columna id UUID
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='device_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='id') THEN
        
        -- Añadir columna id con UUIDs generados automáticamente
        ALTER TABLE patients ADD COLUMN id UUID DEFAULT uuid_generate_v4();
        
        -- Poblar bracelets a partir de los device_id existentes
        INSERT INTO bracelets (device_id, patient_id, status, assigned_at)
        SELECT device_id, id, 'ASIGNADO', CURRENT_TIMESTAMP
        FROM patients
        ON CONFLICT (device_id) DO UPDATE SET patient_id = EXCLUDED.patient_id;

        -- Eliminar restricción de clave primaria vieja
        ALTER TABLE patients DROP CONSTRAINT patients_pkey CASCADE;
        
        -- Establecer id como nueva clave primaria
        ALTER TABLE patients ADD PRIMARY KEY (id);
        
        -- Renombrar columnas para estandarizar formato
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='name') THEN
            ALTER TABLE patients RENAME COLUMN name TO full_name;
        END IF;
    END IF;
END $$;

-- Asegurar columnas requeridas en patients (Ubicación, Contactos de Emergencia y Asignación de Enfermeros)
ALTER TABLE patients ADD COLUMN IF NOT EXISTS room_number VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS floor VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact_name VARCHAR(100);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(30);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS medical_notes TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_patients_assigned_nurse ON patients (assigned_nurse_id);

-- Restricción de género únicamente a dos opciones: 'Hombre' y 'Mujer'
UPDATE patients SET gender = 'Hombre' WHERE gender IN ('MASCULINO', 'Masculino') OR gender IS NULL OR gender NOT IN ('Hombre', 'Mujer');
UPDATE patients SET gender = 'Mujer' WHERE gender IN ('FEMENINO', 'Femenino');
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_gender_check;
ALTER TABLE patients ADD CONSTRAINT patients_gender_check CHECK (gender IN ('Hombre', 'Mujer'));

-- 5. Crear tabla patient_thresholds
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

-- 6. Crear tabla clinical_measurements
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

-- 7. Actualizar tabla alerts con criticidad y estado actual
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS criticality VARCHAR(20) NOT NULL DEFAULT 'MEDIA';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS current_status VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';

-- 8. Crear tabla alert_tracking
CREATE TABLE IF NOT EXISTS alert_tracking (
    id BIGSERIAL PRIMARY KEY,
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status_changed_to VARCHAR(20) NOT NULL CHECK (status_changed_to IN ('EN_ATENCION', 'ATENDIDA')),
    action_notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_tracking_alert_id ON alert_tracking (alert_id);

-- 9. Crear tabla notifications
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

COMMIT;

