-- Migration: Add is_active column to equipment table
-- This column is used to mark equipment as active/inactive
-- Inactive equipment won't be counted in dashboard stats

-- Add is_active column with default true
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_equipment_is_active ON equipment(is_active);

-- Add index for airport_id + is_active combination (common query pattern)
CREATE INDEX IF NOT EXISTS idx_equipment_airport_active ON equipment(airport_id, is_active) WHERE is_active = true;
