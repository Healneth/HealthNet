-- ══════════════════════════════════════════════════════════════════════════
-- HEALTH NET — Migración v7.0: Archivado de Pacientes y Suspensión de Cuentas RBAC
-- ══════════════════════════════════════════════════════════════════════════
-- Esta migración implementa la persistencia a nivel de base de datos para:
-- 1. Archivado asistencial de pacientes con conservación de expediente e histórico.
-- 2. Suspensión administrativa de cuentas de usuario con registro de motivo y responsable.
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Campos de archivado en la tabla de pacientes (patients)
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS archived_by VARCHAR(150),
ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_is_archived ON patients (is_archived);
CREATE INDEX IF NOT EXISTS idx_patients_archived_at ON patients (archived_at);

-- 2. Campos de suspensión en la tabla de usuarios (users)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspended_by VARCHAR(150),
ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
CREATE INDEX IF NOT EXISTS idx_users_suspended_at ON users (suspended_at);

-- 3. Comentarios explicativos de auditoría
COMMENT ON COLUMN patients.is_archived IS 'Indica si el paciente ha sido archivado (baja asistencial o alta médica), conservando su expediente histórico.';
COMMENT ON COLUMN patients.archived_at IS 'Fecha y hora exacta en la que se realizó el archivado.';
COMMENT ON COLUMN patients.archived_by IS 'Nombre o correo del Administrador que autorizó el archivado.';
COMMENT ON COLUMN patients.archived_reason IS 'Motivo clínico o administrativo del archivado del paciente.';

COMMENT ON COLUMN users.is_active IS 'Indica si la cuenta está activa o suspendida. Si es FALSE, el usuario no puede iniciar sesión ni operar.';
COMMENT ON COLUMN users.suspended_at IS 'Fecha y hora de la suspensión administrativa.';
COMMENT ON COLUMN users.suspended_by IS 'Nombre o correo del Administrador que aplicó la suspensión.';
COMMENT ON COLUMN users.suspended_reason IS 'Motivo detallado de la suspensión de la cuenta.';
