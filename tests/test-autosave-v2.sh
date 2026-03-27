#!/bin/bash

# Script untuk menguji fitur auto-save log peralatan dengan format 6 kolom
# Kolom: ID, Nama Alat, Status, Keterangan, Waktu Update, Bandara
# Usage: ./test-autosave-v2.sh [command]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Database configuration - adjust as needed
DB_NAME="toc_equipment_db"  # Ganti dengan nama database Anda
DB_USER="postgres"          # Ganti dengan username database Anda

show_help() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Auto-Save Log Testing Tool (6 Kolom)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Format Data: ID | Nama Alat | Status | Keterangan | Waktu Update | Bandara"
    echo ""
    echo "Usage: ./test-autosave-v2.sh [command]"
    echo ""
    echo "Commands:"
    echo "  check-db       - Check database connection and equipment_logs table"
    echo "  view-logs      - View recent equipment logs (6 kolom format)"
    echo "  view-stats     - View equipment log statistics"
    echo "  view-timeline  - View status timeline for specific equipment"
    echo "  cleanup        - Clean up old logs (>30 days)"
    echo "  demo           - Run demo scheduler (30 second interval)"
    echo "  help           - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./test-autosave-v2.sh check-db"
    echo "  ./test-autosave-v2.sh view-logs"
    echo "  ./test-autosave-v2.sh view-timeline 1"
    echo ""
}

check_database() {
    echo -e "${YELLOW}Checking database connection...${NC}"
    
    # Check if psql is available
    if ! command -v psql &> /dev/null; then
        echo -e "${RED}Error: psql command not found${NC}"
        echo "Please install PostgreSQL client tools"
        exit 1
    fi
    
    # Check database connection
    if psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Database connection successful${NC}"
    else
        echo -e "${RED}✗ Cannot connect to database${NC}"
        echo "Please check your database configuration"
        exit 1
    fi
    
    # Check equipment_logs table structure
    echo -e "${YELLOW}Checking equipment_logs table structure...${NC}"
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'equipment_logs'
        ORDER BY ordinal_position;
    "
    
    echo ""
    echo -e "${GREEN}✓ equipment_logs table exists${NC}"
    
    # Check if new columns exist
    echo -e "${YELLOW}Checking for 6-column format...${NC}"
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            COUNT(*) as total_logs,
            COUNT(equipment_name) as with_equipment_name,
            COUNT(status) as with_status,
            COUNT(airport_name) as with_airport_name
        FROM equipment_logs;
    "
}

view_logs() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Recent Equipment Logs (6 Kolom)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Format: ID | Nama Alat | Status | Keterangan | Waktu Update | Bandara"
    echo ""
    
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            l.id as \"ID\",
            COALESCE(l.equipment_name, e.name) as \"Nama Alat\",
            COALESCE(l.status, l.data->>'status', 'Unknown') as \"Status\",
            LEFT(l.data::text, 80) as \"Keterangan (Parameter)\",
            TO_CHAR(l.logged_at, 'YYYY-MM-DD HH24:MI:SS') as \"Waktu Update\",
            COALESCE(l.airport_name, a.name, 'Unknown') as \"Bandara\"
        FROM equipment_logs l
        LEFT JOIN equipment e ON l.equipment_id = e.id
        LEFT JOIN airports a ON e.airport_id = a.id
        ORDER BY l.logged_at DESC
        LIMIT 20;
    "
}

view_stats() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Equipment Log Statistics (24 hours)${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            COALESCE(l.airport_name, a.name, 'Unknown') as \"Bandara\",
            COUNT(*) as \"Total Logs\",
            COUNT(*) FILTER (WHERE COALESCE(l.status, l.data->>'status') = 'Normal') as \"Normal\",
            COUNT(*) FILTER (WHERE COALESCE(l.status, l.data->>'status') = 'Warning') as \"Warning\",
            COUNT(*) FILTER (WHERE COALESCE(l.status, l.data->>'status') = 'Alert') as \"Alert\",
            COUNT(*) FILTER (WHERE COALESCE(l.status, l.data->>'status') = 'Disconnect') as \"Disconnect\",
            MAX(l.logged_at) as \"Last Log\"
        FROM equipment_logs l
        LEFT JOIN equipment e ON l.equipment_id = e.id
        LEFT JOIN airports a ON e.airport_id = a.id
        WHERE l.logged_at > NOW() - INTERVAL '24 hours'
        GROUP BY COALESCE(l.airport_name, a.name)
        ORDER BY \"Total Logs\" DESC;
    "
}

view_timeline() {
    local equipment_id=$1
    
    if [ -z "$equipment_id" ]; then
        echo -e "${RED}Error: Equipment ID required${NC}"
        echo "Usage: ./test-autosave-v2.sh view-timeline [equipment_id]"
        echo ""
        echo "Available equipment:"
        psql -U $DB_USER -d $DB_NAME -c "
            SELECT id, name, code FROM equipment ORDER BY id LIMIT 10;
        "
        return
    fi
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Status Timeline for Equipment ID: $equipment_id${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            l.id as \"ID\",
            COALESCE(l.equipment_name, e.name) as \"Nama Alat\",
            COALESCE(l.status, l.data->>'status', 'Unknown') as \"Status\",
            LEFT(l.data::text, 60) as \"Keterangan\",
            TO_CHAR(l.logged_at, 'YYYY-MM-DD HH24:MI:SS') as \"Waktu Update\",
            COALESCE(l.airport_name, a.name, 'Unknown') as \"Bandara\"
        FROM equipment_logs l
        LEFT JOIN equipment e ON l.equipment_id = e.id
        LEFT JOIN airports a ON e.airport_id = a.id
        WHERE l.equipment_id = $equipment_id
        ORDER BY l.logged_at DESC
        LIMIT 50;
    "
}

cleanup_logs() {
    echo -e "${YELLOW}Cleaning up old logs (>30 days)...${NC}"
    
    psql -U $DB_USER -d $DB_NAME -c "
        DELETE FROM equipment_logs 
        WHERE logged_at < NOW() - INTERVAL '30 days';
    "
    
    echo -e "${GREEN}✓ Cleanup completed${NC}"
}

run_demo() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Running Demo Scheduler${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "This will run the scheduler in demo mode (30 second interval)"
    echo "Data will be saved with 6-column format:"
    echo "  1. ID (auto-generated)"
    echo "  2. Nama Alat"
    echo "  3. Status (Normal/Warning/Alert/Disconnect)"
    echo "  4. Keterangan (JSON parameters)"
    echo "  5. Waktu Update"
    echo "  6. Bandara"
    echo ""
    echo "Press Ctrl+C to stop"
    echo ""
    
    # Check if node-cron is installed
    if ! npm list node-cron > /dev/null 2>&1; then
        echo -e "${YELLOW}Installing node-cron...${NC}"
        npm install node-cron
    fi
    
    node run-scheduler-demo.js
}

# Main script logic
case "$1" in
    check-db)
        check_database
        ;;
    view-logs)
        view_logs
        ;;
    view-stats)
        view_stats
        ;;
    view-timeline)
        view_timeline $2
        ;;
    cleanup)
        cleanup_logs
        ;;
    demo)
        run_demo
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        ;;
esac
