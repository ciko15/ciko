-- Migration: Add data filtering and quality columns to equipment_logs
-- For MySQL

-- Add changes column to store parsed data changes
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'changes') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN changes JSON',
    'SELECT "Column changes already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add data_quality column to track data validation status
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'data_quality') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN data_quality VARCHAR(20) DEFAULT "valid"',
    'SELECT "Column data_quality already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add threshold_applied column to track if thresholds were applied
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'threshold_applied') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN threshold_applied BOOLEAN DEFAULT FALSE',
    'SELECT "Column threshold_applied already exists"'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create index for data_quality filtering
CREATE INDEX IF NOT EXISTS idx_equipment_logs_quality ON equipment_logs(data_quality);
CREATE INDEX IF NOT EXISTS idx_equipment_logs_threshold ON equipment_logs(threshold_applied);