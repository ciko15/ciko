-- Database Migration: Add Threshold Settings Table
-- This table stores threshold configurations for equipment monitoring

-- Threshold configurations table
CREATE TABLE IF NOT EXISTS equipment_thresholds (
    id SERIAL PRIMARY KEY,
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    parameter_name VARCHAR(100) NOT NULL,
    oid_key VARCHAR(50) NOT NULL,
    warning_low DECIMAL(15,2),
    warning_high DECIMAL(15,2),
    critical_low DECIMAL(15,2),
    critical_high DECIMAL(15,2),
    unit VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(equipment_id, oid_key)
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_thresholds_equipment ON equipment_thresholds(equipment_id);

-- Add threshold_config JSONB column to equipment table (optional alternative approach)
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS threshold_config JSONB;

-- Function to auto-update equipment status based on thresholds
CREATE OR REPLACE FUNCTION update_equipment_status_from_thresholds()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT := 'Normal';
    v_equipment_id INTEGER;
    v_data JSONB;
    v_param_name TEXT;
    v_value DECIMAL(15,2);
    v_threshold RECORD;
BEGIN
    -- Determine which equipment_id to use
    IF TG_TABLE_NAME = 'equipment_logs' THEN
        v_equipment_id := NEW.equipment_id;
        v_data := NEW.data;
    ELSIF TG_TABLE_NAME = 'equipment' THEN
        v_equipment_id := NEW.id;
        v_data := NEW.snmp_config;
    ELSE
        RETURN NEW;
    END IF;
    
    -- Get the latest data from logs for this equipment
    SELECT data INTO v_data
    FROM equipment_logs
    WHERE equipment_id = v_equipment_id
    ORDER BY logged_at DESC
    LIMIT 1;
    
    IF v_data IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check each threshold for this equipment
    FOR v_threshold IN 
        SELECT parameter_name, oid_key, warning_low, warning_high, critical_low, critical_high
        FROM equipment_thresholds
        WHERE equipment_id = v_equipment_id AND is_active = TRUE
    LOOP
        -- Get value from data using parameter name
        EXECUTE format('SELECT ($1->>%L)::decimal', v_threshold.oid_key) 
        INTO v_value 
        USING v_data;
        
        IF v_value IS NOT NULL THEN
            -- Check critical range first
            IF v_threshold.critical_low IS NOT NULL AND v_value < v_threshold.critical_low THEN
                v_status := 'Alert';
                EXIT;
            END IF;
            
            IF v_threshold.critical_high IS NOT NULL AND v_value > v_threshold.critical_high THEN
                v_status := 'Alert';
                EXIT;
            END IF;
            
            -- Check warning range
            IF v_threshold.warning_low IS NOT NULL AND v_value < v_threshold.warning_low THEN
                IF v_status = 'Normal' THEN
                    v_status := 'Warning';
                END IF;
            END IF;
            
            IF v_threshold.warning_high IS NOT NULL AND v_value > v_threshold.warning_high THEN
                IF v_status = 'Normal' THEN
                    v_status := 'Warning';
                END IF;
            END IF;
        END IF;
    END LOOP;
    
    -- Update equipment status if changed
    UPDATE equipment
    SET status = v_status, updated_at = CURRENT_TIMESTAMP
    WHERE id = v_equipment_id AND status != v_status;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update status when new log entry is created
DROP TRIGGER IF EXISTS trigger_update_status_on_log ON equipment_logs;
CREATE TRIGGER trigger_update_status_on_log
AFTER INSERT ON equipment_logs
FOR EACH ROW
EXECUTE FUNCTION update_equipment_status_from_thresholds();

-- Insert sample threshold configurations for common parameters
-- Note: These are examples, users should configure based on their equipment
INSERT INTO equipment_thresholds (equipment_id, parameter_name, oid_key, warning_low, warning_high, critical_low, critical_high, unit, is_active)
SELECT 
    e.id,
    'Temperature'::varchar,
    'temperature'::varchar,
    15.0, 35.0, 0.0, 50.0, '°C', TRUE
FROM equipment e
WHERE e.category = 'Data Processing'
ON CONFLICT (equipment_id, oid_key) DO NOTHING;

INSERT INTO equipment_thresholds (equipment_id, parameter_name, oid_key, warning_low, warning_high, critical_low, critical_high, unit, is_active)
SELECT 
    e.id,
    'Humidity'::varchar,
    'humidity'::varchar,
    30.0, 70.0, 10.0, 90.0, '%', TRUE
FROM equipment e
WHERE e.category = 'Data Processing'
ON CONFLICT (equipment_id, oid_key) DO NOTHING;

INSERT INTO equipment_thresholds (equipment_id, parameter_name, oid_key, warning_low, warning_high, critical_low, critical_high, unit, is_active)
SELECT 
    e.id,
    'Power Status'::varchar,
    'power_status'::varchar,
    NULL, 1.0, NULL, 2.0, NULL, TRUE
FROM equipment e
WHERE e.category = 'Support'
ON CONFLICT (equipment_id, oid_key) DO NOTHING;

-- Comments for documentation
COMMENT ON TABLE equipment_thresholds IS 'Stores threshold configurations for automatic equipment status updates';
COMMENT ON COLUMN equipment_thresholds.warning_low IS 'Lower bound for warning status';
COMMENT ON COLUMN equipment_thresholds.warning_high IS 'Upper bound for warning status';
COMMENT ON COLUMN equipment_thresholds.critical_low IS 'Lower bound for critical/alert status';
COMMENT ON COLUMN equipment_thresholds.critical_high IS 'Upper bound for critical/alert status';
