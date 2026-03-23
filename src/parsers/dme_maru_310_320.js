const BaseParser = require('./base');

const SOH = 0x01;
const STX = 0x02;
const ETX = 0x03;

function readUInt16BE(data, offset) {
    if (offset + 2 > data.length) return null;
    return (data[offset] << 8) | data[offset + 1];
}

class DmeMaru310320Parser extends BaseParser {
    parse(rawData) {
        try {
            const buf = typeof rawData === 'string' ? Buffer.from(rawData, 'binary') : rawData;
            const frames = this.parseFrames(buf);
            
            if (frames.length === 0) {
                throw new Error("No valid DME frames found");
            }

            // Ambil frame pertama
            const parsedData = frames[0];

            // Fitur BaseParser
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
            return {
                success: false,
                error: error.message,
                status: 'Error',
                timestamp: new Date().toISOString()
            };
        }
    }

    decode7A(data) {
        if (data.length < 0x7A) return null;
        const r = {};
        r.m1_sys_delay = readUInt16BE(data, 0x00) / 100.0;
        r.m1_reply_eff = readUInt16BE(data, 0x10);
        r.m1_fwd_power = readUInt16BE(data, 0x14) / 10.0;
        r.m1_5v_ps = readUInt16BE(data, 0x20) / 10.0;
        r.m1_15v_ps = readUInt16BE(data, 0x22) / 10.0;
        r.m1_48v_ps = readUInt16BE(data, 0x24) / 10.0;
        
        try {
            let identStr = String.fromCharCode(data[0x5E], data[0x5F], data[0x60]);
            r.ident = identStr.replace(/\x00/g, '') || '---';
        } catch (e) {
            r.ident = '---';
        }
        return r;
    }

    parseFrames(buf) {
        const results = [];
        let i = 0;
        while (i < buf.length - 3) {
            if (buf[i] !== SOH) { i++; continue; }
            const stxPos = buf.indexOf(STX, i + 1);
            if (stxPos < 0) break;
            const etxPos = buf.indexOf(ETX, stxPos + 1);
            if (etxPos < 0) break;

            try {
                const hdrHex = buf.slice(i + 1, stxPos).toString('ascii').replace(/\s+/g, '');
                const payHex = buf.slice(stxPos + 1, etxPos).toString('ascii').replace(/\s+/g, '');
                const hdr = Buffer.from(hdrHex, 'hex');
                const pay = Buffer.from(payHex, 'hex');

                if (hdr.length >= 8 && hdr[0] === 0x01 && hdr[1] === 0x02) {
                    const unit = hdr[2];
                    const length = (hdr[6] << 8) | hdr[7];
                    if (length === 0x7A && pay.length >= 0x7A) {
                        const decoded = this.decode7A(pay.slice(0, 0x7A));
                        if (decoded) { decoded.unit = unit; results.push(decoded); }
                    }
                }
            } catch (e) { }
            i = etxPos + 1;
        }
        return results;
    }
}
module.exports = DmeMaru310320Parser;