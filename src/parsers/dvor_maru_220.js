const BaseParser = require('./base');

const SOH = '\x01';
const STX = '\x02';
const ETX = '\x03';
const TAG_MAP = { 'LC': 'LC', 'N1': 'N1', 'N2': 'N2', 'G1': 'G1', 'G2': 'G2' };

// Fungsi pembantu
function fi(p, k, div) {
    try {
        if (p[k] === undefined || p[k] === null) return null;
        const val = parseInt(p[k], 10);
        if (isNaN(val)) return null;
        return Math.round((val / div) * 10) / 10;
    } catch (e) {
        return null;
    }
}

function fi4(p, k, div) {
    try {
        if (p[k] === undefined || p[k] === null) return null;
        const val = parseInt(p[k], 10);
        if (isNaN(val)) return null;
        return Math.round((val / div) * 10000) / 10000;
    } catch (e) {
        return null;
    }
}

function fs(p, k) {
    return p[k] !== undefined ? p[k] : null;
}

class DvorMaru220Parser extends BaseParser {
    parse(rawData) {
        try {
            // 1. Ekstrak Sections
            const sections = this.extractSections(rawData);
            if (Object.keys(sections).length === 0) {
                throw new Error("No valid DVOR sections found in data");
            }

            // 2. Decode Data
            const parsedData = this.decodeAll(sections);

            // 3. Gunakan fitur BaseParser untuk check Alarms & Thresholds
            const alarmResult = this.checkAlarms(parsedData);
            const finalData = this.applyThresholdOverrides(parsedData);

            return {
                success: true,
                data: finalData,
                status: alarmResult.status,
                alarms: alarmResult.alarms,
                warnings: alarmResult.warnings,
                triggeredParams: alarmResult.triggeredParams,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error(`[DVOR Maru 220] Parse error: ${error.message}`);
            return {
                success: false,
                error: error.message,
                status: 'Error',
                timestamp: new Date().toISOString()
            };
        }
    }

    extractSections(buf) {
        const bufStr = typeof buf === 'string' ? buf : buf.toString('ascii');
        const results = {};
        let i = 0;

        while (i < bufStr.length - 3) {
            if (bufStr.slice(i, i + 2) === SOH + STX) {
                const tag = bufStr.slice(i + 2, i + 4);
                if (TAG_MAP[tag]) {
                    const etxPos = bufStr.indexOf(ETX, i + 4);
                    if (etxPos > i + 4) {
                        const seg = bufStr.slice(i + 4, etxPos);
                        const params = {};
                        const regex = /([A-Z]\d+)=([^|\x03\x01]+)/g;
                        let match;
                        while ((match = regex.exec(seg)) !== null) {
                            params[match[1]] = match[2].trim();
                        }
                        if (Object.keys(params).length > 0) {
                            results[TAG_MAP[tag]] = params;
                        }
                        i = etxPos + 5;
                        continue;
                    }
                }
            }
            i++;
        }
        return results;
    }

    decodeAll(sections) {
        const result = {};
        
        // Ekstrak Parameter Monitor 1 (N1)
        const n1 = sections['N1'];
        if (n1) {
            result['mon1_rf_level'] = fi(n1, 'S1', 10);
            result['mon1_30hz_am'] = fi(n1, 'S2', 10);
            result['mon1_azimuth'] = fi(n1, 'S3', 10);
            result['mon1_9960hz_fm'] = fi(n1, 'S4', 10);
        }

        // Ekstrak Parameter Transmitter 1 (G1)
        const g1 = sections['G1'];
        if (g1) {
            result['tx1_5v_ps'] = fi(g1, 'S11', 10);
            result['tx1_15v_ps'] = fi(g1, 'S12', 10);
            result['tx1_48v_ps'] = fi(g1, 'S13', 10);
            result['tx1_status'] = fs(g1, 'S20') === '1' ? 'Normal' : 'Alarm';
        }
        
        // Ekstrak Parameter Monitor 2 (N2)
        const n2 = sections['N2'];
        if (n2) {
            result['mon2_rf_level'] = fi(n2, 'S1', 10);
            result['mon2_30hz_am'] = fi(n2, 'S2', 10);
            result['mon2_azimuth'] = fi(n2, 'S3', 10);
            result['mon2_9960hz_fm'] = fi(n2, 'S4', 10);
        }

        // Ekstrak Parameter Transmitter 2 (G2)
        const g2 = sections['G2'];
        if (g2) {
            result['tx2_5v_ps'] = fi(g2, 'S11', 10);
            result['tx2_15v_ps'] = fi(g2, 'S12', 10);
            result['tx2_48v_ps'] = fi(g2, 'S13', 10);
            result['tx2_status'] = fs(g2, 'S20') === '1' ? 'Normal' : 'Alarm';
        }
        
        // Ekstrak Local Control (LC)
        const lc = sections['LC'];
        if (lc) {
            result['sys_mode'] = fs(lc, 'S10') === '1' ? 'TX1 Main' : 'TX2 Main';
        }

        return result;
    }
}

module.exports = DvorMaru220Parser;