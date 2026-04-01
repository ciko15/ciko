/**
 * WebSocket Server for Real-Time Updates
 * TOC Project - Airport Management System
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

// Initialize WebSocket server
function initializeWebSocket(server) {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-key-change-in-production');
        socket.user = decoded;
      } catch (err) {
        // Allow connection without auth for public dashboard
        socket.user = null;
      }
    }
    next();
  });

  // Connection handlers
  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id}, User: ${socket.user?.username || 'anonymous'}`);

    // Join room based on user role
    if (socket.user) {
      if (socket.user.role === 'admin' || socket.user.role === 'user_pusat') {
        socket.join('admins');
      }
      socket.join(`user_${socket.user.id}`);
      if (socket.user.branchId) {
        socket.join(`branch_${socket.user.branchId}`);
      }
    }

    // Handle equipment subscription
    socket.on('subscribe:equipment', (equipmentId) => {
      socket.join(`equipment_${equipmentId}`);
      console.log(`[WS] Socket ${socket.id} subscribed to equipment ${equipmentId}`);
    });

    socket.on('unsubscribe:equipment', (equipmentId) => {
      socket.leave(`equipment_${equipmentId}`);
      console.log(`[WS] Socket ${socket.id} unsubscribed from equipment ${equipmentId}`);
    });

    // Handle airport subscription
    socket.on('subscribe:airport', (airportId) => {
      socket.join(`airport_${airportId}`);
      console.log(`[WS] Socket ${socket.id} subscribed to airport ${airportId}`);
    });

    socket.on('unsubscribe:airport', (airportId) => {
      socket.leave(`airport_${airportId}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`[WS] Client disconnected: ${socket.id}, Reason: ${reason}`);
    });

    // Handle ping
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  });

  console.log('[WS] WebSocket server initialized');
  return io;
}

// Emit equipment update to all connected clients
function emitEquipmentUpdate(equipmentId, data) {
  if (io) {
    io.to(`equipment_${equipmentId}`).emit('equipment:update', data);
    io.emit('equipment:list:update', data);
  }
}

// Emit equipment status change
function emitEquipmentStatusChange(equipmentId, status, details) {
  if (io) {
    io.to(`equipment_${equipmentId}`).emit('equipment:status:change', {
      equipmentId,
      status,
      details,
      timestamp: new Date().toISOString()
    });
    io.emit('equipment:status:update', {
      equipmentId,
      status,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

// Emit alarm notification
function emitAlarm(equipmentId, alarm) {
  if (io) {
    io.to(`equipment_${equipmentId}`).emit('equipment:alarm', alarm);
    io.to('admins').emit('equipment:alarm', {
      ...alarm,
      equipmentId,
      timestamp: new Date().toISOString()
    });
  }
}

// Emit connection test result
function emitConnectionTestResult(equipmentId, result) {
  if (io) {
    io.to(`equipment_${equipmentId}`).emit('equipment:connection:test', result);
  }
}

// Emit statistics update
function emitStatsUpdate(stats) {
  if (io) {
    io.emit('stats:update', stats);
  }
}

// Emit surveillance data update
function emitSurveillanceUpdate(type, data) {
  if (io) {
    io.emit(`surveillance:${type}:update`, data);
  }
}

// Get IO instance
function getIO() {
  return io;
}

module.exports = {
  initializeWebSocket,
  emitEquipmentUpdate,
  emitEquipmentStatusChange,
  emitAlarm,
  emitConnectionTestResult,
  emitStatsUpdate,
  emitSurveillanceUpdate,
  getIO
};
