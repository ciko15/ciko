-- Migration for equipment_logs columns (MySQL)
-- Adds equipment_name, status, airport_name, and airport_city if missing

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'equipment_name') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN equipment_name VARCHAR(100)',
    'SELECT "Column equipment_name already exists"'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'status') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN status VARCHAR(50)',
    'SELECT "Column status already exists"'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'airport_name') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN airport_name VARCHAR(100)',
    'SELECT "Column airport_name already exists"'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'equipment_logs' AND COLUMN_NAME = 'airport_city') = 0,
    'ALTER TABLE equipment_logs ADD COLUMN airport_city VARCHAR(100)',
    'SELECT "Column airport_city already exists"'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
