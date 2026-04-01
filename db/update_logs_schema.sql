-- Update equipment_logs table to add missing columns for 6-column format
-- This migration adds columns needed by the getEquipmentLogs function

-- Add equipment_name column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'equipment_logs' AND column_name = 'equipment_name') THEN
        ALTER TABLE equipment_logs ADD COLUMN equipment_name VARCHAR(100);
    END IF;
END $$;

-- Add status column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'equipment_logs' AND column_name = 'status') THEN
        ALTER TABLE equipment_logs ADD COLUMN status VARCHAR(20);
    END IF;
END $$;

-- Add airport_name column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'equipment_logs' AND column_name = 'airport_name') THEN
        ALTER TABLE equipment_logs ADD COLUMN airport_name VARCHAR(100);
    END IF;
END $$;

-- Add airport_city column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'equipment_logs' AND column_name = 'airport_city') THEN
        ALTER TABLE equipment_logs ADD COLUMN airport_city VARCHAR(100);
    END IF;
END $$;

-- Add equipment_code column if not exists (for frontend compatibility)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'equipment_logs' AND column_name = 'equipment_code') THEN
        ALTER TABLE equipment_logs ADD COLUMN equipment_code VARCHAR(50);
    END IF;
END $$;

-- Update existing records to populate new columns from related tables
UPDATE equipment_logs el
SET 
    equipment_name = COALESCE(el.equipment_name, e.name),
    equipment_code = COALESCE(el.equipment_code, e.code),
    status = COALESCE(el.status, el.data->>'status', 'Unknown'),
    airport_name = COALESCE(el.airport_name, a.name, 'Unknown')
FROM equipment e
LEFT JOIN airports a ON e.airport_id = a.id
WHERE el.equipment_id = e.id
AND (el.equipment_name IS NULL OR el.airport_name IS NULL);

-- Create indexes for better performance on new columns
CREATE INDEX IF NOT EXISTS idx_equipment_logs_equipment_name ON equipment_logs(equipment_name);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_status ON equipment_logs(status);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_airport ON equipment_logs(airport_name);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_source ON equipment_logs(source);

-- Verify the schema update
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'equipment_logs' 
ORDER BY ordinal_position;
