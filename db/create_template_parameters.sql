-- Create template_parameters table for equipment templates
CREATE TABLE IF NOT EXISTS template_parameters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    template_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    parameter_key VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL,
    unit VARCHAR(20),
    warning_min DECIMAL(10, 2),
    warning_max DECIMAL(10, 2),
    alarm_min DECIMAL(10, 2),
    alarm_max DECIMAL(10, 2),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES equipment_templates(id) ON DELETE CASCADE,
    UNIQUE(template_id, parameter_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create index for faster queries
CREATE INDEX idx_template_params_template_id ON template_parameters(template_id);

-- Seed data for DME L-3 Standard template parameters
INSERT INTO template_parameters (template_id, name, parameter_key, type, unit, warning_min, alarm_min, description) VALUES
(1, 'MON1 Reply Efficiency', 'm1_reply_eff', 'percent', '%', 75.00, 70.00, 'Monitor 1 Reply Efficiency - percentage'),
(1, 'MON1 Forward Power', 'm1_fwd_power', 'power', 'W', 850.00, 800.00, 'Monitor 1 Forward Power - watts'),
(1, 'MON2 Reply Efficiency', 'm2_reply_eff', 'percent', '%', 75.00, 70.00, 'Monitor 2 Reply Efficiency - percentage'),
(1, 'MON2 Forward Power', 'm2_fwd_power', 'power', 'W', 850.00, 800.00, 'Monitor 2 Forward Power - watts');

-- Seed data for DVOR L-3 Standard template parameters
INSERT INTO template_parameters (template_id, name, parameter_key, type, unit, warning_min, alarm_min, description) VALUES
(2, 'Bearing Alignment', 'bearing_alignment', 'angle', '°', 0.50, 1.00, 'Bearing alignment error threshold');
