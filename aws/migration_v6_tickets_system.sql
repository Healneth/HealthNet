-- ──────────────────────────────────────────────────────────────────────
-- HEALTH NET — Migración v6.0: Sistema de Tickets y Seguimiento de Alertas
-- ──────────────────────────────────────────────────────────────────────
-- Implementa entidades relacionales completas para:
-- 1. tickets: registro de alertas con folio único, asignación territorial,
--    criticidad y ciclo de vida (recibido, en_progreso, completado).
-- 2. ticket_notes: bitácora cronológica inmutable de observaciones clínicas y acciones.
-- 3. ticket_transfers: registro formal de transferencias de tickets entre turnos (handoff).
-- 4. ticket_activity: línea de tiempo de auditoría de actividad para cada ticket.
-- ──────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────────────────────────────────
-- 1. TABLA: tickets
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

CREATE INDEX IF NOT EXISTS idx_tickets_folio ON tickets (folio);
CREATE INDEX IF NOT EXISTS idx_tickets_patient ON tickets (patient_id);
CREATE INDEX IF NOT EXISTS idx_tickets_nurse ON tickets (assigned_nurse_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_criticality ON tickets (criticality);
CREATE INDEX IF NOT EXISTS idx_tickets_shift ON tickets (shift_type);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 2. TABLA: ticket_notes
-- Bitácora inmutable de notas de atención clínica
-- ──────────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────────
-- 3. TABLA: ticket_transfers
-- Historial formal de entregas de turno y transferencias de tickets
-- ──────────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────────
-- 4. TABLA: ticket_activity
-- Registro cronológico de auditoría y ciclo de vida del ticket
-- ──────────────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket_id ON ticket_activity (ticket_id, created_at ASC);
