-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Migración v4.0: Historial y Programación de Turnos de Enfermería
-- ──────────────────────────────────────────────────────────────────────
-- Permite registrar, rotar y consultar turnos de enfermeros (matutino,
-- vespertino, nocturno) con horarios configurables por establecimiento,
-- evitando solapamientos y preservando el historial cronológico de turnos.
-- ──────────────────────────────────────────────────────────────────────

-- 1. Tabla de Configuración de Horarios de Turnos por Establecimiento
CREATE TABLE IF NOT EXISTS facility_shift_config (
    id VARCHAR(20) PRIMARY KEY, -- 'matutino', 'vespertino', 'nocturno'
    name VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description VARCHAR(150),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Turnos predeterminados con horarios de referencia
INSERT INTO facility_shift_config (id, name, start_time, end_time, description) VALUES
('matutino', 'Matutino', '07:00:00', '15:00:00', 'Turno matutino habitual'),
('vespertino', 'Vespertino', '15:00:00', '23:00:00', 'Turno vespertino habitual'),
('nocturno', 'Nocturno', '23:00:00', '07:00:00', 'Turno nocturno / velada')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    description = EXCLUDED.description;

-- 2. Tabla de Asignaciones y Rotaciones Históricas de Turnos
-- NOTA: No sobrescribe semanas anteriores, preservando historial completo.
CREATE TABLE IF NOT EXISTS nurse_shift_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nurse_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL, -- Fecha del lunes de inicio de la semana
    shift_type VARCHAR(20) NOT NULL REFERENCES facility_shift_config(id),
    days JSONB DEFAULT '["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]'::jsonb,
    notes TEXT,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Restricción de integridad: Impide que un enfermero tenga dos turnos incompatibles en la misma semana
    CONSTRAINT uq_nurse_week UNIQUE (nurse_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_nurse_shifts_nurse ON nurse_shift_assignments (nurse_id);
CREATE INDEX IF NOT EXISTS idx_nurse_shifts_week ON nurse_shift_assignments (week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_nurse_shifts_type ON nurse_shift_assignments (shift_type);

-- 3. Campo de turno por defecto en la ficha del usuario
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_shift VARCHAR(20) DEFAULT 'matutino';

