// In-memory state for realistic simulated values (Random Walk)
const simulationState: Record<string, any> = {};

/**
 * Generator for DVOR MARU 220 raw data (text-based)
 */
export function generateDvorMaruData(equipmentId: string | number) {
    const stateKey = `${equipmentId}_dvor`;
    if (!simulationState[stateKey]) {
        simulationState[stateKey] = { 
            rf_level: 100,     // 10.0 W
            azimuth: 3590,     // 359.0 deg
            am_30hz: 300,      // 30.0 %
            fm_9960hz: 300,    // 30.0 %
            v5: 50,            // 5.0 V
            v15: 150,          // 15.0 V
            v48: 480,          // 48.0 V
            
            mon2_rf_level: 98,
            mon2_azimuth: 3585,
            mon2_am_30hz: 295,
            mon2_fm_9960hz: 305,
            tx2_v5: 51,
            tx2_v15: 148,
            tx2_v48: 482
        };
    }
    const state = simulationState[stateKey];

    state.rf_level += (Math.random() * 2 - 1);
    state.azimuth += (Math.random() * 2 - 1);
    if (state.azimuth > 3600) state.azimuth -= 3600;
    if (state.azimuth < 0) state.azimuth += 3600;
    state.am_30hz += (Math.random() * 1 - 0.5);
    state.fm_9960hz += (Math.random() * 1 - 0.5);
    state.v5 += (Math.random() * 0.2 - 0.1);
    state.v15 += (Math.random() * 0.4 - 0.2);
    state.v48 += (Math.random() * 1 - 0.5);
    
    state.mon2_rf_level += (Math.random() * 2 - 1);
    state.mon2_azimuth += (Math.random() * 2 - 1);
    if (state.mon2_azimuth > 3600) state.mon2_azimuth -= 3600;
    if (state.mon2_azimuth < 0) state.mon2_azimuth += 3600;
    state.mon2_am_30hz += (Math.random() * 1 - 0.5);
    state.mon2_fm_9960hz += (Math.random() * 1 - 0.5);
    state.tx2_v5 += (Math.random() * 0.2 - 0.1);
    state.tx2_v15 += (Math.random() * 0.4 - 0.2);
    state.tx2_v48 += (Math.random() * 1 - 0.5);

    const n1Frame = `\x01\x02N1S1=${Math.round(state.rf_level)}|S2=${Math.round(state.am_30hz)}|S3=${Math.round(state.azimuth)}|S4=${Math.round(state.fm_9960hz)}\x03`;
    const g1Frame = `\x01\x02G1S11=${Math.round(state.v5)}|S12=${Math.round(state.v15)}|S13=${Math.round(state.v48)}|S20=1\x03`;
    const n2Frame = `\x01\x02N2S1=${Math.round(state.mon2_rf_level)}|S2=${Math.round(state.mon2_am_30hz)}|S3=${Math.round(state.mon2_azimuth)}|S4=${Math.round(state.mon2_fm_9960hz)}\x03`;
    const g2Frame = `\x01\x02G2S11=${Math.round(state.tx2_v5)}|S12=${Math.round(state.tx2_v15)}|S13=${Math.round(state.tx2_v48)}|S20=1\x03`;
    const lcFrame = `\x01\x02LCS10=1\x03`;

    return n1Frame + g1Frame + n2Frame + g2Frame + lcFrame;
}

/**
 * Generator for DME MARU 310/320 raw data (ASCII-HEX)
 */
export function generateDmeMaruData(equipmentId: string | number) {
    const stateKey = `${equipmentId}_dme`;
    if (!simulationState[stateKey]) {
        simulationState[stateKey] = { 
            fwd_power: 9500, 
            reply_eff: 98, 
            sys_delay: 5000,
            v5: 50,
            v15: 150,
            v48: 480
        };
    }
    const state = simulationState[stateKey];

    state.fwd_power += (Math.random() * 20 - 10);
    state.reply_eff += (Math.random() * 0.4 - 0.2);
    state.sys_delay += (Math.random() * 10 - 5);
    state.v5 += (Math.random() * 0.2 - 0.1);
    state.v15 += (Math.random() * 0.4 - 0.2);
    state.v48 += (Math.random() * 1 - 0.5);

    if (state.reply_eff > 100) state.reply_eff = 100;

    const payload = Buffer.alloc(0x7A, 0);
    payload.writeUInt16BE(Math.round(state.sys_delay), 0x00);
    payload.writeUInt16BE(Math.round(state.reply_eff), 0x10);
    payload.writeUInt16BE(Math.round(state.fwd_power), 0x14);
    payload.writeUInt16BE(Math.round(state.v5), 0x20);
    payload.writeUInt16BE(Math.round(state.v15), 0x22);
    payload.writeUInt16BE(Math.round(state.v48), 0x24);
    payload.write('JPA', 0x5E, 3, 'ascii');

    const payloadHex = payload.toString('hex');
    const header = Buffer.alloc(8);
    header[0] = 0x01;
    header[1] = 0x02;
    header.writeUInt16BE(0x7A, 6);
    const headerHex = header.toString('hex');

    return `\x01${headerHex}\x02${payloadHex}\x03`;
}

/**
 * Generate simulated SNMP data based on template
 */
export async function generateSimulatedData(templateId: string, equipmentId: string | number = 'default') {
  if (Math.random() > 0.95) {
    throw new Error('Simulated Timeout: Device is unreachable');
  }

  const db = require('../../db/database');
  let template: any;
  try {
      template = await db.getSnmpTemplateById(templateId);
  } catch(e) {}

  const stateKey = `${equipmentId}_${templateId}`;
  if (!simulationState[stateKey]) {
      simulationState[stateKey] = {};
  }
  const state = simulationState[stateKey];

  if (template && (template.oidMappings || template.oid_mappings)) {
      let mappings = template.oidMappings || template.oid_mappings;
      if (typeof mappings === 'string') {
          try { mappings = JSON.parse(mappings); } catch (e) { mappings = {}; }
      }
      const result: any = {};
      
      for (const [key, mapping] of Object.entries(mappings) as any) {
          let value;
          const type = (mapping.type || 'INTEGER').toUpperCase();
          
          if (type.includes('INT') || type === 'GAUGE32' || type === 'TIMETICKS') {
              if (state[key] !== undefined) {
                  let delta = (Math.random() * 4) - 2;
                  value = state[key] + delta;
                  const max = mapping.criticalHigh || mapping.criticalThreshold || 100;
                  const min = mapping.criticalLow || 0;
                  if (value > max + 5) value -= 3;
                  if (value < min - 5) value += 3;
              } else {
                  if (mapping.warningLow && mapping.warningHigh) {
                      value = (mapping.warningLow + mapping.warningHigh) / 2;
                  } else if (mapping.warningThreshold) {
                      value = mapping.warningThreshold - (Math.random() * 5);
                  } else {
                      value = Math.floor(Math.random() * 50) + 20;
                  }
              }
              state[key] = value;
              value = String(Math.floor(value));
          } else {
              if (!state[key]) {
                  state[key] = mapping.label === 'Operational Status' ? 'Online' : 
                               mapping.label === 'Device Name' ? 'Simulated-Device' : '1';
              }
              value = String(state[key]);
          }
          
          result[key] = {
              oid: `${template.oidBase}.${mapping.oid}`,
              value: value,
              type: type,
              label: mapping.label || key,
              unit: mapping.unit || '',
              timestamp: new Date().toISOString()
          };
      }
      return result;
  }

  // default mock
  return {
    status: { value: 'Normal', type: 'STRING' },
    value: { value: String(Math.round(25 + Math.random() * 5)), type: 'INTEGER' }
  };
}
