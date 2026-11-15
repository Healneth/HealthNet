-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Migración v3.0: Auditoría de Modificaciones y RBAC Reforzado
-- Registra quién modificó información clínica, personal o asignaciones,
-- cuándo ocurrió el cambio y qué valores fueron modificados.
-- ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50),
    user_email VARCHAR(120),
    user_role VARCHAR(20) NOT NULL,
    user_name VARCHAR(150),
    action VARCHAR(60) NOT NULL, -- UPDATE_PROFILE, UPDATE_VITALS, UPDATE_THRESHOLDS, ASSIGN_NURSE, ATTEND_ALERT, REGISTER_PATIENT, DELETE_PATIENT
    entity_type VARCHAR(50) NOT NULL, -- patient, thresholds, alert, bracelet, user
    entity_id VARCHAR(100) NOT NULL,
    details TEXT,
    changes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_role ON audit_log (user_role);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at DESC);

