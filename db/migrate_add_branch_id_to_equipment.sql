-- Migration: Add branch_id column to equipment table
-- Purpose: Associate equipment with a branch (airport) explicitly.

-- Add branch_id column to equipment table (nullable for backward compatibility)
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS branch_id INT NULL;

-- Backfill existing records by copying airport_id if branch_id is missing
UPDATE equipment
SET branch_id = airport_id
WHERE (branch_id IS NULL OR branch_id = 0) AND airport_id IS NOT NULL;

-- Create index for faster queries on branch_id
CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id);

-- (Optional) Add foreign key constraint to enforce referential integrity.
-- Be careful: this will fail if there are any branch_id values that do not exist in airports.
-- Uncomment if you want strict enforcement.
-- ALTER TABLE equipment
--   ADD CONSTRAINT fk_equipment_branch
--   FOREIGN KEY (branch_id) REFERENCES airports(id) ON DELETE SET NULL;
