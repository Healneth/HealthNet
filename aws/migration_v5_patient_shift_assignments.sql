-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Migración v5.0: Asignación Territorial de Pacientes por Turno
-- ──────────────────────────────────────────────────────────────────────
-- Permite asignar pacientes a enfermeros responsables según su turno
-- programado (matutino, vespertino, nocturno), admitiendo hasta 3 enfermeros
-- por paciente (uno por cada turno) y un enfermero con múltiples pacientes a cargo.
-- Preserva el historial cronológico de asignaciones y retiros.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patient_shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    room_number VARCHAR(50),
    floor VARCHAR(50),
    nurse_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shift_type VARCHAR(20) NOT NULL REFERENCES facility_shift_config(id),
    week_start_date DATE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawn_reason TEXT,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Restricción de unicidad condicional:
-- Un paciente solo puede tener UN enfermero responsable ACTIVO por cada turno en una semana dada.
-- Al retirar una asignación (active = FALSE), se conserva el registro histórico para auditoría.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_shift_week_active 
ON patient_shift_assignments (patient_id, shift_type, week_start_date)
WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_psa_nurse ON patient_shift_assignments (nurse_id, active);
CREATE INDEX IF NOT EXISTS idx_psa_patient ON patient_shift_assignments (patient_id, active);
CREATE INDEX IF NOT EXISTS idx_psa_week ON patient_shift_assignments (week_start_date);
CREATE INDEX IF NOT EXISTS idx_psa_shift ON patient_shift_assignments (shift_type);

