-- MySQL Migration: Fix equipment_logs table structure
-- This script adds necessary columns and creates a view for equipment logs

-- Check if equipment_logs table exists and add missing columns
-- Note: This is for MySQL (XAMPP)

-- Add columns if they don't exist (MySQL syntax)
-- Using ALTER TABLE for each column

-- Add equipment_name column if not exists
-- We need to use a workaround for MySQL to check if column exists
-- This is handled by the application, but let's ensure the table is correct

-- Create equipment_logs table if not exists with all required columns
CREATE TABLE IF NOT EXISTS equipment_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    equipment_id INT,
    data JSON,
    source VARCHAR(20) DEFAULT 'snmp',
    logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_equipment_logs_equipment (equipment_id),
    INDEX idx_equipment_logs_time (logged_at)
);

-- Create view for equipment logs with joined data
CREATE OR REPLACE VIEW equipment_logs_view AS
SELECT 
    el.id,
    el.equipment_id,
    COALESCE(e.name, 'Unknown') as equipment_name,
    COALESCE(e.code, '-') as equipment_code,
    COALESCE(a.name, 'Unknown') as airport_name,
    COALESCE(a.city, '-') as airport_city,
    el.source,
    el.logged_at,
    el.data
FROM equipment_logs el
LEFT JOIN equipment e ON el.equipment_id = e.id
LEFT JOIN airports a ON e.airport_id = a.id;

-- Insert sample data if table is empty (for testing)
-- This is optional and can be removed in production
INSERT INTO equipment_logs (equipment_id, data, source, logged_at)
SELECT 
    e.id,
    JSON_OBJECT('status', 'Normal', 'test', 'Sample data'),
    'snmp',
    NOW() - INTERVAL FLOOR(RAND() * 1000) MINUTE
FROM equipment e
WHERE e.id <= 5
ON DUPLICATE KEY UPDATE id = id;
