-- ══════════════════════════════════════════════════════════════════════════
-- HEALTH NET — Migración v8.0: Corrección de Integridad, Relaciones y Consolidación
-- ══════════════════════════════════════════════════════════════════════════
-- Objetivos de la migración:
-- 1. Ampliar restricción de estado en bracelets para permitir 'NO_EN_USO' (archivado).
-- 2. Añadir 'bed_number' y 'archived_by_user_id' en patients.
-- 3. Añadir 'suspended_by_user_id' y asegurar 'default_shift' en users.
-- 4. Preservación histórica de registros clínicos (evitar CASCADE destructivo en mediciones y alertas al desvincular o retirar dispositivos).
-- 5. Preservación histórica de turnos y asignaciones (sustituir CASCADE destructivo por RESTRICT en nurse_id).
-- 6. Enlace relacional estricto con UUID de paciente (patient_uuid) en tickets y patient_shift_assignments.
-- 7. Paridad de datos e interoperabilidad entre alerts y tickets (folio, title, clinical_value, shift_type).
-- 8. Flexibilidad de criticidad en tickets (case-insensitive) y acciones de auditoría en ticket_activity.
-- 9. Campos de telemetría completa en clinical_measurements e índices de alta frecuencia.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────
-- 1. CORRECCIÓN EN BRACELETS: Permitir estado 'NO_EN_USO'
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    ALTER TABLE bracelets DROP CONSTRAINT IF EXISTS bracelets_status_check;
    ALTER TABLE bracelets ADD CONSTRAINT bracelets_status_check 
        CHECK (status IN ('DISPONIBLE', 'ASIGNADO', 'MANTENIMIENTO', 'NO_EN_USO'));
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 2. MEJORAS EN PATIENTS: Ubicación hospitalaria completa y auditoría de archivado
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE patients ADD COLUMN IF NOT EXISTS bed_number VARCHAR(20);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_bed_number ON patients (room_number, bed_number);

-- ──────────────────────────────────────────────────────────────────────
-- 3. MEJORAS EN USERS: Auditoría de suspensión y turno por defecto
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_shift VARCHAR(20) DEFAULT 'matutino';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────────
-- 4. PRESERVACIÓN HISTÓRICA: Mediciones clínicas y Alertas
--    Al desvincular o dar de baja un dispositivo de hardware, las mediciones
--    y alertas históricas del paciente NO deben eliminarse en cascada.
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'clinical_measurements_device_id_fkey'
    ) THEN
        ALTER TABLE clinical_measurements DROP CONSTRAINT clinical_measurements_device_id_fkey;
        ALTER TABLE clinical_measurements ADD CONSTRAINT clinical_measurements_device_id_fkey 
            FOREIGN KEY (device_id) REFERENCES bracelets(device_id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'alerts_device_id_fkey'
    ) THEN
        ALTER TABLE alerts DROP CONSTRAINT alerts_device_id_fkey;
        ALTER TABLE alerts ADD CONSTRAINT alerts_device_id_fkey 
            FOREIGN KEY (device_id) REFERENCES bracelets(device_id) ON DELETE SET NULL;
    END IF;
END $$;

-- Columnas adicionales de telemetría completa del ESP32 / simulador
ALTER TABLE clinical_measurements ADD COLUMN IF NOT EXISTS battery_level INT;
ALTER TABLE clinical_measurements ADD COLUMN IF NOT EXISTS accel_x NUMERIC(5, 2);
ALTER TABLE clinical_measurements ADD COLUMN IF NOT EXISTS accel_y NUMERIC(5, 2);
ALTER TABLE clinical_measurements ADD COLUMN IF NOT EXISTS accel_z NUMERIC(5, 2);

-- Índices de consulta frecuente por hardware y fecha
CREATE INDEX IF NOT EXISTS idx_measurements_device_time ON clinical_measurements (device_id, measured_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 5. PRESERVACIÓN HISTÓRICA DE TURNOS Y ASIGNACIONES
--    Evitar borrado accidental de historial de turnos si una cuenta de enfermero es removida.
-- ──────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'nurse_shift_assignments_nurse_id_fkey'
    ) THEN
        ALTER TABLE nurse_shift_assignments DROP CONSTRAINT nurse_shift_assignments_nurse_id_fkey;
        ALTER TABLE nurse_shift_assignments ADD CONSTRAINT nurse_shift_assignments_nurse_id_fkey 
            FOREIGN KEY (nurse_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'patient_shift_assignments_nurse_id_fkey'
    ) THEN
        ALTER TABLE patient_shift_assignments DROP CONSTRAINT patient_shift_assignments_nurse_id_fkey;
        ALTER TABLE patient_shift_assignments ADD CONSTRAINT patient_shift_assignments_nurse_id_fkey 
            FOREIGN KEY (nurse_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 6. INTEGRIDAD RELACIONAL DE TICKETS Y ASIGNACIONES DE PACIENTES
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS patient_uuid UUID REFERENCES patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_patient_uuid ON tickets (patient_uuid);

ALTER TABLE patient_shift_assignments ADD COLUMN IF NOT EXISTS patient_uuid UUID REFERENCES patients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_psa_patient_uuid ON patient_shift_assignments (patient_uuid);

-- Flexibilizar criticidad para aceptar minúsculas y mayúsculas
DO $$
BEGIN
    ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_criticality_check;
    ALTER TABLE tickets ADD CONSTRAINT tickets_criticality_check 
        CHECK (LOWER(criticality) IN ('baja', 'media', 'alta', 'critica'));
END $$;

-- Ampliar acciones en bitácora de actividad de tickets
DO $$
BEGIN
    ALTER TABLE ticket_activity DROP CONSTRAINT IF EXISTS ticket_activity_action_check;
    ALTER TABLE ticket_activity ADD CONSTRAINT ticket_activity_action_check 
        CHECK (action IN ('CREADO', 'ASIGNADO', 'EN_PROGRESO', 'NOTA_AGREGADA', 'TRANSFERENCIA', 'COMPLETADO', 'REASIGNADO', 'ACTUALIZADO'));
END $$;

-- ──────────────────────────────────────────────────────────────────────
-- 7. PARIDAD ENTRE ALERTS Y TICKETS
-- ──────────────────────────────────────────────────────────────────────
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS folio VARCHAR(30);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS clinical_value VARCHAR(150);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20);
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS assigned_nurse_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_folio ON alerts (folio);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_nurse ON alerts (assigned_nurse_id);

-- ──────────────────────────────────────────────────────────────────────
-- 8. ÍNDICES DE AUDITORÍA AVANZADA
-- ──────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log (user_email, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

COMMIT;
