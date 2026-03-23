-- Database Migration: Add Template Parameters Table for Smart Templates
-- This table stores individual parameters with thresholds for equipment templates

-- Template parameters table
CREATE TABLE IF NOT EXISTS template_parameters (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES equipment_templates(id) ON DELETE CASCADE,
    label VARCHAR(100) NOT NULL,
    source VARCHAR(255) NOT NULL, -- OID, register address, JSON key, etc.
    unit VARCHAR(20),
    normal_value DECIMAL(15,2),
    warning_min DECIMAL(15,2),
    warning_max DECIMAL(15,2),
    alarm_min DECIMAL(15,2),
    alarm_max DECIMAL(15,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, source)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_template_params_template ON template_parameters(template_id);
CREATE INDEX IF NOT EXISTS idx_template_params_active ON template_parameters(is_active);

-- Add protocol column to equipment_templates if not exists
ALTER TABLE equipment_templates ADD COLUMN IF NOT EXISTS protocol VARCHAR(50) DEFAULT 'snmp';

-- Update existing templates to have protocol
UPDATE equipment_templates SET protocol = 'snmp' WHERE protocol IS NULL;