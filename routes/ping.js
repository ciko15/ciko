const express = require("express");
const ping = require("ping");

const router = express.Router();

let pingInterval = null;
let pingResults = [];
let currentIp = null;

// Store max 100 results
const MAX_RESULTS = 100;

router.post("/start", async (req, res) => {
    const { ip, interval } = req.body;

    if (!ip || !interval) {
        return res.status(400).json({ error: "IP dan interval wajib diisi" });
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
        return res.status(400).json({ error: "Format IP tidak valid" });
    }

    // Validate interval (1-60 seconds)
    if (interval < 1 || interval > 60) {
        return res.status(400).json({ error: "Interval harus antara 1-60 detik" });
    }

    // Clear existing interval
    if (pingInterval) {
        clearInterval(pingInterval);
        pingResults = [];
    }

    currentIp = ip;
    const intervalMs = interval * 1000;

    // Do initial ping
    const initialResult = await ping.promise.probe(ip, {
        timeout: 5,
    });
    
    pingResults.push({
        time: new Date().toISOString(),
        alive: initialResult.alive,
        responseTime: initialResult.time,
        host: ip
    });

    // Start interval
    pingInterval = setInterval(async () => {
        try {
            const result = await ping.promise.probe(ip, {
                timeout: 5,
            });
            
            const resultObj = {
                time: new Date().toISOString(),
                alive: result.alive,
                responseTime: result.time || 0,
                host: ip
            };
            
            pingResults.push(resultObj);
            
            // Keep only last MAX_RESULTS
            if (pingResults.length > MAX_RESULTS) {
                pingResults = pingResults.slice(-MAX_RESULTS);
            }
            
            console.log(`[Ping] ${ip} - ${result.alive ? 'UP' : 'DOWN'} (${result.time}ms)`);
        } catch (error) {
            console.error(`[Ping] Error:`, error.message);
        }
    }, intervalMs);

    res.json({ 
        message: `Ping ke ${ip} setiap ${interval} detik dimulai`,
        ip: ip,
        interval: interval,
        status: initialResult.alive ? 'online' : 'offline',
        responseTime: initialResult.time
    });
});

router.post("/stop", (req, res) => {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
        
        const result = {
            message: "Ping dihentikan",
            ip: currentIp,
            results: pingResults.length
        };
        
        currentIp = null;
        return res.json(result);
    }
    res.json({ message: "Tidak ada ping aktif" });
});

router.get("/status", (req, res) => {
    if (!currentIp || !pingInterval) {
        return res.json({ 
            active: false, 
            ip: null, 
            results: [] 
        });
    }
    
    res.json({
        active: true,
        ip: currentIp,
        results: pingResults,
        totalResults: pingResults.length
    });
});

router.get("/results", (req, res) => {
    res.json({
        ip: currentIp,
        active: pingInterval !== null,
        results: pingResults
    });
});

module.exports = router;
