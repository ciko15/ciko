const express = require('express');
const ping = require('ping');
const db = require('../db/database'); // Adjust path based on your DB setup

const router = express.Router();

/**
 * Check gateway status for specific airport/cabang
 * Used by cabang filtering feature
 */
router.get('/:airportId/gateway-status', async (req, res) => {
  try {
    const airportId = parseInt(req.params.airportId);
    
    // Get airport gateway IP
    const airportQuery = 'SELECT id, name, ip_branch FROM airports WHERE id = ?';
    const airports = await db.query(airportQuery, [airportId]);
    
    if (!airports || airports.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Airport not found',
        gatewayHealthy: false 
      });
    }
    
    const airport = airports[0];
    const gatewayIp = airport.ip_branch;
    
    if (!gatewayIp || gatewayIp.trim() === '') {
      return res.json({ 
        success: true,
        gatewayHealthy: false,
        ip: null,
        message: 'No gateway IP configured for this airport',
        responseTime: null
      });
    }
    
    // Ping gateway IP (timeout 3s)
    const result = await ping.promise.probe(gatewayIp, { timeout: 3 });
    
    const gatewayHealthy = result.alive;
    
    res.json({
      success: true,
      gatewayHealthy,
      ip: gatewayIp,
      responseTime: gatewayHealthy ? result.time : null,
      message: gatewayHealthy ? 'Gateway reachable' : 'Gateway unreachable',
      airport: {
        id: airport.id,
        name: airport.name
      }
    });
    
  } catch (error) {
    console.error('[Gateway Status] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      gatewayHealthy: false
    });
  }
});

module.exports = router;

