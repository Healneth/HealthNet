-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — MIGRACIÓN V9: SOPORTE PARA PULSADOR FÍSICO PBS-33B
-- Fecha: Noviembre 2026
-- Descripción:
--   1. Incorporación de 'event_id' y 'origin' en tablas 'alerts' y 'tickets'.
--   2. Restricción de unicidad para evitar alertas duplicadas por reintentos MQTT.
--   3. Indicador 'emergency_pressed' en 'clinical_measurements'.
--   4. Trigger de protección contra eliminación para auditoría clínica inmutable.
-- ──────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Ampliar tabla 'alerts'
ALTER TABLE alerts 
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS origin VARCHAR(40) DEFAULT 'SENSOR';

CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_event_id 
    ON alerts(event_id) 
    WHERE event_id IS NOT NULL;

-- 2. Ampliar tabla 'tickets'
ALTER TABLE tickets 
    ADD COLUMN IF NOT EXISTS event_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS origin VARCHAR(40) DEFAULT 'SENSOR';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tickets_event_id 
    ON tickets(event_id) 
    WHERE event_id IS NOT NULL;

-- 3. Registrar estado del pulsador en mediciones clínicas continuas
ALTER TABLE clinical_measurements 
    ADD COLUMN IF NOT EXISTS emergency_pressed BOOLEAN DEFAULT FALSE;

-- 4. Protección contra eliminación accidental de emergencias por botón PBS-33B (Alertas y Tickets)
CREATE OR REPLACE FUNCTION trg_protect_emergency_alerts()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_TABLE_NAME = 'alerts' AND (OLD.origin = 'EMERGENCY_BUTTON' OR OLD.type = 'emergency_button')) OR
       (TG_TABLE_NAME = 'tickets' AND (OLD.origin = 'EMERGENCY_BUTTON' OR OLD.alert_type = 'emergency_button')) THEN
        RAISE EXCEPTION 'Regla de Integridad Clínica: Las alertas y tickets originados por el Botón de Emergencia PBS-33B son inmutables y no pueden eliminarse del registro asistencial.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_emergency_alerts ON alerts;
CREATE TRIGGER trg_prevent_delete_emergency_alerts
    BEFORE DELETE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION trg_protect_emergency_alerts();

DROP TRIGGER IF EXISTS trg_prevent_delete_emergency_tickets ON tickets;
CREATE TRIGGER trg_prevent_delete_emergency_tickets
    BEFORE DELETE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION trg_protect_emergency_alerts();

COMMIT;
