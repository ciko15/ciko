#!/bin/bash

# SNMP Test Script for Airport Management System
# Usage: ./test_snmp.sh <device_ip> <port> <community> [oid_base]

# Default values
DEVICE_IP="${1:-127.0.0.1}"
PORT="${2:-16100}"
COMMUNITY="${3:-moxa_ioThinx_4150}"
OID_BASE="${4:-1.3.6.1.4.1.50000}"

echo "=========================================="
echo "SNMP Connection Test"
echo "=========================================="
echo "Device IP: $DEVICE_IP"
echo "Port: $PORT"
echo "Community: $COMMUNITY"
echo "OID Base: $OID_BASE"
echo "=========================================="

# Test 1: Check if snmp tools are available
echo ""
echo "[Test 1] Checking SNMP tools..."
if command -v snmpwalk &> /dev/null; then
    echo "✓ snmpwalk found: $(snmpwalk -V | head -1)"
else
    echo "✗ snmpwalk NOT found. Please install net-snmp:"
    echo "  macOS: brew install net-snmp"
    echo "  Ubuntu: sudo apt-get install snmp"
    exit 1
fi

# Test 2: Basic SNMP walk
echo ""
echo "[Test 2] Testing SNMP walk..."
echo "Command: snmpwalk -v2c -c $COMMUNITY ${DEVICE_IP}:${PORT} $OID_BASE"
snmpwalk -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "$OID_BASE" 2>&1

# Test 3: Get specific OIDs
echo ""
echo "[Test 3] Testing specific OIDs..."

# Device Name
echo -n "Device Name (1.1.0): "
snmpget -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "${OID_BASE}.1.1.0" 2>&1 | grep -oP '(?<=STRING: ").*(?=")' || echo "N/A"

# Temperature (6.1.0)
echo -n "Temperature (6.1.0): "
snmpget -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "${OID_BASE}.6.1.0" 2>&1 | grep -oP '(?<=INTEGER: ).*' || echo "N/A"

# Humidity (6.2.0)
echo -n "Humidity (6.2.0): "
snmpget -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "${OID_BASE}.6.2.0" 2>&1 | grep -oP '(?<=INTEGER: ).*' || echo "N/A"

# Power Status (5.1.1.0)
echo -n "Power Status (5.1.1.0): "
snmpget -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "${OID_BASE}.5.1.1.0" 2>&1 | grep -oP '(?<=INTEGER: ).*' || echo "N/A"

# Alarm Status (6.3.0)
echo -n "Alarm Status (6.3.0): "
snmpget -v2c -c "$COMMUNITY" "${DEVICE_IP}:${PORT}" "${OID_BASE}.6.3.0" 2>&1 | grep -oP '(?<=INTEGER: ).*' || echo "N/A"

echo ""
echo "=========================================="
echo "Test Complete"
echo "=========================================="

