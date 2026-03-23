#!/bin/bash

# Script untuk menguji fitur auto-save log peralatan
# Usage: ./test-autosave.sh [command]

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
    echo -e "${BLUE}  Auto-Save Log Testing Tool${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "Usage: ./test-autosave.sh [command]"
    echo ""
    echo "Commands:"
    echo "  check-db       - Check database connection and equipment_logs table"
    echo "  view-logs      - View recent equipment logs"
    echo "  view-stats     - View equipment log statistics"
    echo "  view-timeline  - View status timeline for specific equipment"
    echo "  cleanup        - Clean up old logs (>30 days)"
    echo "  demo           - Run demo scheduler (30 second interval)"
    echo "  help           - Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./test-autosave.sh check-db"
    echo "  ./test-autosave.sh view-logs"
    echo "  ./test-autosave.sh view-timeline 1"
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
    
    # Check equipment_logs table
    echo -e "${YELLOW}Checking equipment_logs table...${NC}"
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            COUNT(*) as total_logs,
            COUNT(DISTINCT equipment_id) as unique_equipment,
            MAX(logged_at) as last_log,
            MIN(logged_at) as first_log
        FROM equipment_logs;
    "
    
    echo ""
    echo -e "${GREEN}✓ equipment_logs table exists${NC}"
}

view_logs() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Recent Equipment Logs${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    psql -U $DB_USER -d $DB_NAME -c "
        SELECT 
            l.id,
            e.name as equipment_name,
            e.code,
            e.category,
            l.source,
            l.data->>'status' as status,
            l.logged_at
        FROM equipment_logs l
        JOIN equipment e ON l.equipment_id = e.id
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
            e.name,
            e.code,
            COUNT(*) as total_logs,
            COUNT(*) FILTER (WHERE l.data->>'status' = 'Normal') as normal,
            COUNT(*) FILTER (WHERE l.data->>'status' = 'Warning') as warning,
            COUNT(*) FILTER (WHERE l.data->>'status' = 'Alert') as alert,
            COUNT(*) FILTER (WHERE l.data->>'status' = 'Disconnect') as disconnect,
            MAX(l.logged_at) as last_log
        FROM equipment_logs l
        JOIN equipment e ON l.equipment_id = e.id
        WHERE l.logged_at > NOW() - INTERVAL '24 hours'
        GROUP BY e.id, e.name, e.code
        ORDER BY total_logs DESC;
    "
}

view_timeline() {
    local equipment_id=$1
    
    if [ -z "$equipment_id" ]; then
        echo -e "${RED}Error: Equipment ID required${NC}"
        echo "Usage: ./test-autosave.sh view-timeline [equipment_id]"
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
            logged_at,
            data->>'status' as status,
            data->>'temperature' as temp,
            data->>'humidity' as humidity,
            source
        FROM equipment_logs
        WHERE equipment_id = $equipment_id
        ORDER BY logged_at DESC
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
