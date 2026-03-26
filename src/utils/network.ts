import { exec } from 'child_process';
const db = require('../../db/database');
import { generateDvorMaruData, generateDmeMaruData, generateSimulatedData } from './simulators';

/**
 * Validates an IP address string
 */
export const isValidIP = (ip: string): boolean => {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
};

/**
 * Validates an OID string
 */
export const isValidOID = (oid: string): boolean => {
  return /^[0-9.]+$/.test(oid);
};

/**
 * Executes an SNMP Get command for a single OID
 */
export async function snmpGet(oid: string, host: string, port: number | string = 161, community: string = 'public'): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!isValidIP(host)) {
            return reject(new Error('Invalid host IP'));
        }

        const portNum = typeof port === 'string' ? parseInt(port) : port;
        const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '');
        const safeCommunity = community.replace(/[^a-zA-Z0-9_]/g, '');
        const safeOid = oid.replace(/[^0-9.]/g, '');

        const cmd = `snmpget -v2c -c ${safeCommunity} ${safeHost}:${portNum} ${safeOid}`;
        
        exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                return reject(error);
            }

            const match = stdout.match(/=\s*(\w+):\s*(.*)/);
            if (match) {
                let value = match[2].trim();
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                resolve({ value, type: match[1], oid: safeOid });
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Executes an SNMP Walk/Bulk command for multiple OIDs
 */
export async function snmpGetBulk(oids: string[], host: string, port: number | string = 161, community: string = 'public'): Promise<any[]> {
  return new Promise((resolve, reject) => {
    if (!isValidIP(host)) {
      return reject(new Error('Invalid host IP'));
    }
    
    const portNum = typeof port === 'string' ? parseInt(port) : port;
    const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '');
    const safeCommunity = community.replace(/[^a-zA-Z0-9_]/g, '');
    
    // For bulk/walk, we often use the base OID
    const firstOid = oids[0];
    const parts = firstOid.split('.');
    
    // Logic to determine base OID (similar to server.js)
    let baseOid = firstOid;
    if (parts.length > 5) {
        baseOid = parts.slice(0, 8).join('.'); 
    }
    
    const cmd = `snmpwalk -v2c -c ${safeCommunity} ${safeHost}:${portNum} ${baseOid}`;
    
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      
      const results: any[] = [];
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('No more variables'));
      
      for (const line of lines) {
        // More robust parsing for different snmpwalk output formats
        const match = line.match(/::([\w.-]+)\s*=\s*(\w+):\s*(.*)/) || line.match(/iso\.([\w.-]+)\s*=\s*(\w+):\s*(.*)/);
        if (match) {
          let value = match[3].trim();
          if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
          
          results.push({ 
              oid: match[1], 
              fullOid: match[0].split('=')[0].trim(), 
              value, 
              type: match[2] 
          });
        }
      }
      resolve(results);
    });
  });
}

/**
 * Combines fetching and parsing logic for equipment
 */
export async function fetchAndParseData(equipment: any) {
    const config = equipment.snmpConfig || equipment.snmp_config;
    const templateId = config?.templateId;
    const ipAddress = equipment.ipAddress || (config ? config.ip : null);

    // Simulation Mode logic
    const SIMULATION_MODE = true; // For now

    if (SIMULATION_MODE) {
        let rawData;
        let pResult;

        switch (templateId) {
            case 'dvor_maru_220':
                rawData = generateDvorMaruData(equipment.id);
                // Need to import ParserFactory or equivalent
                pResult = await parseAdvancedData('dvor_maru_220', rawData, equipment);
                return { parsedData: pResult.data, status: pResult.status };
            case 'dme_maru_310_320':
                rawData = generateDmeMaruData(equipment.id);
                pResult = await parseAdvancedData('dme_maru_310_320', rawData, equipment);
                return { parsedData: pResult.data, status: pResult.status };
            default:
                rawData = await generateSimulatedData(templateId, equipment.id);
                return { parsedData: rawData, status: await determineStatus(rawData, templateId) };
        }
    }

    // Real SNMP logic would go here
    throw new Error('Real SNMP not implemented in this chunk');
}

/**
 * Determine status based on thresholds
 */
export async function determineStatus(data: any, templateId: string) {
    const thresholdEvaluator = require('./thresholdEvaluator');
    
    let template;
    try {
        template = await db.getSnmpTemplateById(templateId);
    } catch (e) {
        template = null;
    }

    if (template && template.parameters && template.parameters.length > 0) {
        let overallStatus = 'Normal';
        const statusPriority: Record<string, number> = { 'Alert': 3, 'Warning': 2, 'Normal': 1, 'Disconnect': 0 };

        for (const param of template.parameters) {
            const valueObj = data[param.source] || data[param.label];
            if (!valueObj || valueObj.value === undefined) continue;

            const config = {
                warning_min: param.warning_min,
                warning_max: param.warning_max,
                alarm_min: param.alarm_min,
                alarm_max: param.alarm_max
            };

            const status = thresholdEvaluator.checkThreshold(valueObj.value, config);
            if (statusPriority[status] > statusPriority[overallStatus]) {
                overallStatus = status;
            }
        }
        return overallStatus;
    }

    const defaultThresholds: Record<string, any> = {
        temperature: { warning: 35, critical: 45 },
        humidity: { warningLow: 30, warningHigh: 80, criticalLow: 20, criticalHigh: 90 },
        alarmStatus: { warning: 1, critical: 2 }
    };

    let thresholds = defaultThresholds;
    if (template && (template.oidMappings || template.oid_mappings)) {
        const oidMappings = template.oidMappings || template.oid_mappings;
        let pMappings = typeof oidMappings === 'string' ? JSON.parse(oidMappings) : oidMappings;
        thresholds = {};
        for (const [key, mapping] of Object.entries(pMappings) as any) {
            if (mapping.warningThreshold !== undefined || mapping.criticalThreshold !== undefined) {
                thresholds[key] = { warning: mapping.warningThreshold, critical: mapping.criticalThreshold };
            }
            if (mapping.warningLow !== undefined || mapping.warningHigh !== undefined) {
                thresholds[key] = { ...thresholds[key], warningLow: mapping.warningLow, warningHigh: mapping.warningHigh, criticalLow: mapping.criticalLow, criticalHigh: mapping.criticalHigh };
            }
        }
    }

    let status = 'Normal';
    for (const [key, valueObj] of Object.entries(data) as any) {
        if (!valueObj || valueObj.value === undefined) continue;
        const value = parseFloat(valueObj.value);
        if (isNaN(value)) continue;
        const threshold = thresholds[key];
        if (!threshold) continue;
        
        if (threshold.warningLow !== undefined && threshold.warningHigh !== undefined) {
            if (value <= threshold.criticalLow || value >= threshold.criticalHigh) return 'Alert';
            if (value <= threshold.warningLow || value >= threshold.warningHigh) status = 'Warning';
        } else if (threshold.criticalThreshold !== undefined) {
            if (value >= threshold.criticalThreshold) return 'Alert';
            if (threshold.warningThreshold !== undefined && value >= threshold.warningThreshold) status = 'Warning';
        }
    }
    return status;
}

/**
 * Helper to parse advanced data using ParserFactory
 */
async function parseAdvancedData(type: string, rawData: any, equipment: any) {
    const ParserFactory = require('../parsers/factory');
    const parser = ParserFactory.createParser(type, {
        ...equipment,
        parser_config: {},
        threshold_overrides: {}
    });
    if (!parser) throw new Error(`Parser for ${type} not found`);
    const result = parser.parse(rawData);
    if (!result.success) throw new Error(`Parsing failed for ${equipment.name}: ${result.error}`);
    return result;
}
