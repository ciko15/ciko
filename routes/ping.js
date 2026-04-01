const express = require("express");
const ping = require("ping");

const router = express.Router();

let pingInterval = null;
let pingResults = [];
let currentIp = null;

// Store max 100 results
const MAX_RESULTS = 100;

// Tambahkan null check untuk menghindari error pada toFixed()
const safeToFixed = (value, digits) => {
    if (value == null || isNaN(value)) return "N/A";
    return Number(value).toFixed(digits);
};

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
    try {
        const result = await ping.promise.probe(ip);
        pingResults.push({
            ip,
            time: safeToFixed(result.time, 2),
            status: result.alive ? "Alive" : "Dead",
        });
    } catch (error) {
        console.error("Ping error:", error);
    }

    // Start interval ping
    pingInterval = setInterval(async () => {
        try {
            const result = await ping.promise.probe(ip);
            pingResults.push({
                ip,
                time: safeToFixed(result.time, 2),
                status: result.alive ? "Alive" : "Dead",
            });

            if (pingResults.length > MAX_RESULTS) {
                pingResults.shift();
            }
        } catch (error) {
            console.error("Ping error:", error);
        }
    }, intervalMs);

    res.json({ message: "Ping started", ip, interval });
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
