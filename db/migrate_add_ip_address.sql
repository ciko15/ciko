-- Add dedicated IP address column for equipment ping functionality
-- This allows ping testing without relying on SNMP config

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_equipment_ip ON equipment(ip_address) WHERE ip_address IS NOT NULL;

-- Note: This column will be used for ping functionality
-- The ping API will first check this dedicated column, then fall back to snmp_config->>'ip'
