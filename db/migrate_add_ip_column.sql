-- Migration: Add ip_address column to equipment table
-- Purpose: Store equipment IP address in a dedicated column for easier access

-- Add ip_address column to equipment table
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50);

-- Create index for faster queries on ip_address
CREATE INDEX IF NOT EXISTS idx_equipment_ip ON equipment(ip_address);

-- Copy existing IP addresses from snmp_config to the new column
-- This will populate the new column with existing IP data
UPDATE equipment 
SET ip_address = (snmp_config->>'ip')::VARCHAR
WHERE snmp_config IS NOT NULL 
AND snmp_config->>'ip' IS NOT NULL
AND snmp_config->>'ip' != '';

-- Verify the data
SELECT id, name, code, ip_address, snmp_config FROM equipment LIMIT 10;

-- Comment for documentation
COMMENT ON COLUMN equipment.ip_address IS 'IP Address for equipment network connection (SNMP, JSON, etc.)';
