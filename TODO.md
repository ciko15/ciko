# TOC Project - Implementation TODO
Generated from approved issue.md plan. Status: [In Progress] 📋

## Issue 1: Equipment Menu Action Data Cannot Close
- ✅ **Step 1.1**: Edit public/app.js - Add robust modal close handlers with stopPropagation()
  - Target selectors: '.modal-overlay', '#closeSnmpDataModal', etc.
  - Clear liveDataTimer on close
- [ ] **Step 1.2**: Test modal close (X button, overlay click, ESC key)
- [ ] **Step 1.3**: Verify no event conflicts in viewSnmpData/viewEquipmentDetail

## Issue 2: Cabang Data Not Filtered by IP Gateway
- ✅ **Step 2.1**: Create new route endpoint `/api/airports/:airportId/gateway-status` (routes/airports.js)
  - Query airports.ip_branch, ping with ping library (3s timeout)
  - Returns {gatewayHealthy: bool, responseTime, ip, message}
- [ ] **Step 2.2**: Edit public/cabang-app.js - Update loadAirportEquipment()
  - Fetch gateway status first
  - Hide equipment + show warning if gateway DOWN
  - Add gateway status UI indicator
- [ ] **Step 2.3**: Edit src/services/equipment.js - Update collectFromEquipment()
  - JOIN airports.ip_branch
  - Ping gateway first unless bypassGateway=true
- [ ] **Step 2.4**: Test cabang filtering
  - Invalid gateway IP → equipment hidden
  - Valid gateway → normal equipment load + parsing
- [ ] **Step 2.5**: Verify bypassGateway toggle works in equipment edit form

## Testing & Validation
- [ ] Backend: Test new /gateway-status endpoint with curl/Postman
- [ ] Frontend: Full E2E test (login → cabang → select airport → verify filtering)
- [ ] DB: Check `SELECT id, name, ip_branch FROM airports LIMIT 5;`
- [ ] Edge Cases: Offline gateway, bypass toggle, template parsing

## Completion Criteria
- [ ] All checkboxes checked
- [ ] No console errors
- [ ] Modals close properly
- [ ] Cabang shows correct filtering

**Next**: Mark step complete → I'll update TODO.md automatically. Use `attempt_completion` when ALL done.

