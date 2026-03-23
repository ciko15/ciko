-- Seed SNMP Templates for MySQL
-- Run this file to populate snmp_templates table

INSERT INTO snmp_templates (id, name, description, oid_base, oid_mappings, category, is_default) VALUES 
    ('moxa_ioThinx_4150', 'MOXA ioThinx 4150', 'Industrial I/O Controller', '1.3.6.1.4.1.50000', 
     '{"deviceName": {"oid": "1.1.0", "type": "string", "label": "Device Name"}, "firmware": {"oid": "1.2.0", "type": "string", "label": "Firmware Version"}, "uptime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}, "digitalInput_1": {"oid": "2.1.0", "type": "integer", "label": "Digital Input 1"}, "digitalInput_2": {"oid": "2.2.0", "type": "integer", "label": "Digital Input 2"}, "digitalInput_3": {"oid": "2.3.0", "type": "integer", "label": "Digital Input 3"}, "analogInput_1": {"oid": "3.1.0", "type": "integer", "label": "Analog Input 1"}, "analogInput_1_value": {"oid": "3.2.0", "type": "integer", "label": "Analog Input 1 Value"}, "analogInput_1_unit": {"oid": "3.3.0", "type": "string", "label": "Analog Input 1 Unit"}, "relayOutput_1": {"oid": "4.1.0", "type": "integer", "label": "Relay Output 1"}, "relayOutput_1_status": {"oid": "4.2.0", "type": "integer", "label": "Relay Output 1 Status"}, "powerStatus": {"oid": "5.1.1.0", "type": "integer", "label": "Power Status", "warningThreshold": 0, "criticalThreshold": 0}, "batteryStatus": {"oid": "5.1.2.0", "type": "integer", "label": "Battery Status"}, "temperature": {"oid": "6.1.0", "type": "integer", "label": "Temperature", "unit": "°C", "warningThreshold": 35, "criticalThreshold": 45}, "humidity": {"oid": "6.2.0", "type": "integer", "label": "Humidity", "unit": "%", "warningLow": 30, "warningHigh": 80, "criticalLow": 20, "criticalHigh": 90}, "alarmStatus": {"oid": "6.3.0", "type": "integer", "label": "Alarm Status", "warningThreshold": 1, "criticalThreshold": 2}}',
     'Support',
     1),
    ('generic_snmp', 'Generic SNMP Device', 'Standard SNMP device (RFC1213)', '1.3.6.1.2.1',
     '{"sysDescr": {"oid": "1.1.0", "type": "string", "label": "System Description"}, "sysUpTime": {"oid": "1.3.0", "type": "timeticks", "label": "System Uptime"}, "sysContact": {"oid": "1.4.0", "type": "string", "label": "System Contact"}, "sysName": {"oid": "1.5.0", "type": "string", "label": "System Name"}, "sysLocation": {"oid": "1.6.0", "type": "string", "label": "System Location"}}',
     'Communication',
     1),
    ('radar_system', 'Radar System', 'Primary Surveillance Radar', '1.3.6.1.4.1.99991',
     '{"radarStatus": {"oid": "1.1.0", "type": "integer", "label": "Radar Status", "warningThreshold": 1, "criticalThreshold": 2}, "azimuth": {"oid": "2.1.0", "type": "integer", "label": "Azimuth Angle", "unit": "degrees"}, "range": {"oid": "2.2.0", "type": "integer", "label": "Range", "unit": "NM"}, "scanRate": {"oid": "2.3.0", "type": "integer", "label": "Scan Rate", "unit": "RPM"}, "powerOutput": {"oid": "3.1.0", "type": "integer", "label": "Power Output", "unit": "kW", "warningThreshold": 80, "criticalThreshold": 90}, "coolingStatus": {"oid": "3.2.0", "type": "integer", "label": "Cooling Status", "warningThreshold": 1, "criticalThreshold": 2}}',
     'Surveillance',
     1),
    ('generic_json', 'Generic JSON Device', 'Standard JSON/API device', '1.0.0',
     '{"status": {"key": "status", "type": "string", "label": "Device Status"}, "temperature": {"key": "temperature", "type": "number", "label": "Temperature"}, "humidity": {"key": "humidity", "type": "number", "label": "Humidity"}, "uptime": {"key": "uptime", "type": "number", "label": "Uptime"}, "power": {"key": "power", "type": "boolean", "label": "Power Status"}}',
     'Support',
     1),
    ('generic_modbus', 'Generic Modbus Device', 'Standard Modbus TCP/RTU device', '1.0.0',
     '{"coil_1": {"address": 0, "type": "coil", "label": "Coil 1"}, "coil_2": {"address": 1, "type": "coil", "label": "Coil 2"}, "holding_register_1": {"address": 0, "type": "holding", "label": "Register 1"}, "holding_register_2": {"address": 1, "type": "holding", "label": "Register 2"}, "input_register_1": {"address": 0, "type": "input", "label": "Input 1"}}',
     'Support',
     1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
