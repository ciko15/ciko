-- Migration: Add protocol column to snmp_templates table
-- This allows templates to support multiple protocols beyond SNMP

ALTER TABLE snmp_templates 
ADD COLUMN IF NOT EXISTS protocol VARCHAR(20) DEFAULT 'snmp' NOT NULL;

-- Update existing templates to have 'snmp' protocol
UPDATE snmp_templates SET protocol = 'snmp' WHERE protocol IS NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_snmp_templates_protocol ON snmp_templates(protocol);
