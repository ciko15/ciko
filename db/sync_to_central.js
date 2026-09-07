const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const CENTRAL_DB_HOST = '172.20.16.117';
const CENTRAL_DB_PORT = 3306;
const CENTRAL_DB_NAME = 'smart_toc';
const CENTRAL_DB_USER = 'smarttoc';
const CENTRAL_DB_PASS = 'OrangHebat3rnap!';

async function readJsonSafe(filename) {
  try {
    const p = path.join(__dirname, filename);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return [];
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
    return [];
  }
}

async function runSync() {
  console.log('[SYNC] Connecting to Central Database...');
  let connection;
  try {
    connection = await mysql.createConnection({
      host: CENTRAL_DB_HOST,
      port: CENTRAL_DB_PORT,
      user: CENTRAL_DB_USER,
      password: CENTRAL_DB_PASS,
      database: CENTRAL_DB_NAME
    });
    console.log('[SYNC] Connected successfully.');
  } catch (err) {
    console.error('[SYNC] Failed to connect to Central DB:', err.message);
    process.exit(1);
  }

  // 1. Sync sup_category.json -> equipment_templates
  const supCategories = await readJsonSafe('sup_category.json');
  console.log(`[SYNC] Found ${supCategories.length} categories in sup_category.json`);
  
  // Create a mapping from sup_category name to equipment_templates ID
  const templateIdMap = new Map();
  
  for (const cat of supCategories) {
    const subs = cat.sub_categories || [];
    for (const sub of subs) {
      // Check if equipment_template exists
      const [existingRows] = await connection.query('SELECT id FROM equipment_templates WHERE name = ?', [sub]);
      let templateId;
      if (existingRows.length > 0) {
        templateId = existingRows[0].id;
      } else {
        // Insert new
        const [insertRes] = await connection.query(
          'INSERT INTO equipment_templates (name, equipment_type, parser_config) VALUES (?, ?, ?)',
          [sub, cat.category, '{}']
        );
        templateId = insertRes.insertId;
        console.log(`[SYNC] Created new equipment template: ${sub} (ID: ${templateId})`);
      }
      templateIdMap.set(sub.toLowerCase(), templateId);
    }
  }

  // 2. Sync limitation_config.json -> template_parameters
  const limitations = await readJsonSafe('limitation_config.json');
  console.log(`[SYNC] Found ${limitations.length} limitations in limitation_config.json`);
  
  for (const lim of limitations) {
    // Map sup_category to template_id
    const supName = lim.sup_category ? String(lim.sup_category).toLowerCase() : '';
    let templateId = templateIdMap.get(supName);
    
    // If not found, create a generic template for it
    if (!templateId && lim.sup_category) {
      const [existingRows] = await connection.query('SELECT id FROM equipment_templates WHERE name = ?', [lim.sup_category]);
      if (existingRows.length > 0) {
        templateId = existingRows[0].id;
      } else {
        const [insertRes] = await connection.query(
          'INSERT INTO equipment_templates (name, equipment_type, parser_config) VALUES (?, ?, ?)',
          [lim.sup_category, lim.category || 'Support', '{}']
        );
        templateId = insertRes.insertId;
        console.log(`[SYNC] Created new equipment template fallback: ${lim.sup_category} (ID: ${templateId})`);
      }
      templateIdMap.set(supName, templateId);
    }
    
    if (!templateId) {
       console.log(`[SYNC] Skipping limitation ${lim.name} because it has no sup_category`);
       continue;
    }

    const unit = lim.value_type === 'percent' ? '%' : (lim.unit || '');
    
    // Upsert template_parameters based on id
    const [existingParam] = await connection.query('SELECT id FROM template_parameters WHERE id = ?', [lim.id]);
    
    if (existingParam.length > 0) {
      await connection.query(`
        UPDATE template_parameters 
        SET template_id = ?, label = ?, source = ?, unit = ?, 
            alarm_min = ?, alarm_max = ?, warning_min = ?, warning_max = ?
        WHERE id = ?
      `, [
        templateId, lim.name, lim.source || lim.name.toLowerCase().replace(/\\s+/g, '_'), unit,
        lim.alv || lim.min_alarm_limit || null, 
        lim.ahv || lim.max_alarm_limit || null,
        lim.wlv || lim.min_warning_limit || null,
        lim.whv || lim.max_warning_limit || null,
        lim.id
      ]);
    } else {
      await connection.query(`
        INSERT INTO template_parameters 
        (id, template_id, label, source, unit, alarm_min, alarm_max, warning_min, warning_max)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        lim.id, templateId, lim.name, lim.source || lim.name.toLowerCase().replace(/\\s+/g, '_'), unit,
        lim.alv || lim.min_alarm_limit || null, 
        lim.ahv || lim.max_alarm_limit || null,
        lim.wlv || lim.min_warning_limit || null,
        lim.whv || lim.max_warning_limit || null
      ]);
      console.log(`[SYNC] Inserted limitation ${lim.name} (ID: ${lim.id})`);
    }
  }

  // 3. Sync templates_config.json -> snmp_templates
  const templates = await readJsonSafe('templates_config.json');
  console.log(`[SYNC] Found ${templates.length} templates in templates_config.json`);
  
  for (const t of templates) {
    const isDefault = t.isDefault ? 1 : 0;
    const [existingSnmp] = await connection.query('SELECT id FROM snmp_templates WHERE id = ?', [t.id]);
    
    const oidMappingsStr = JSON.stringify(t.oidMappings || t.oid_mappings || {});
    
    if (existingSnmp.length > 0) {
       await connection.query(`
         UPDATE snmp_templates 
         SET name = ?, description = ?, oid_base = ?, oid_mappings = ?, category = ?, is_default = ?
         WHERE id = ?
       `, [
         t.name, t.description || '', t.oidBase || t.oid_base || '', oidMappingsStr, t.category || '', isDefault, t.id
       ]);
    } else {
       await connection.query(`
         INSERT INTO snmp_templates 
         (id, name, description, oid_base, oid_mappings, category, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       `, [
         t.id, t.name, t.description || '', t.oidBase || t.oid_base || '', oidMappingsStr, t.category || '', isDefault
       ]);
       console.log(`[SYNC] Inserted SNMP template ${t.name} (ID: ${t.id})`);
    }
  }
  
  console.log('[SYNC] Migration completed successfully.');
  await connection.end();
}

runSync().catch(console.error);
