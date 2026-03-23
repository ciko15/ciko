/**
 * Template Service - Equipment Templates CRUD with Smart Parameters
 * TOC Project
 */

const db = require('../../db/database');

// Get all templates
async function getAllTemplates() {
  const query = `
    SELECT * FROM equipment_templates
    WHERE is_active = TRUE
    ORDER BY is_system DESC, name ASC
  `;
  const templates = await db.query(query);

  // Get parameters for each template
  for (const template of templates) {
    try {
      const paramQuery = `SELECT * FROM template_parameters WHERE template_id = ? AND is_active = TRUE ORDER BY id`;
      const params = await db.query(paramQuery, [template.id]);
      template.parameters = params || [];
    } catch (error) {
      // If template_parameters table doesn't exist yet, just skip parameters
      console.warn(`[Template] Parameters not available for template ${template.id}:`, error.message);
      template.parameters = [];
    }
  }

  return templates;
}

// Get template by ID
async function getTemplateById(id) {
  const query = `SELECT * FROM equipment_templates WHERE id = ?`;
  const results = await db.query(query, [id]);
  if (!results[0]) return null;

  const template = results[0];

  // Get parameters
  try {
    const paramQuery = `SELECT * FROM template_parameters WHERE template_id = ? AND is_active = TRUE ORDER BY id`;
    const params = await db.query(paramQuery, [id]);
    template.parameters = params || [];
  } catch (error) {
    console.warn(`[Template] Parameters not available for template ${id}:`, error.message);
    template.parameters = [];
  }

  return template;
}

// Get templates by equipment type
async function getTemplatesByType(equipmentType) {
  const query = `
    SELECT * FROM equipment_templates
    WHERE equipment_type = ? AND is_active = TRUE
    ORDER BY is_system DESC, name ASC
  `;
  const templates = await db.query(query, [equipmentType]);

  // Get parameters for each template
  for (const template of templates) {
    try {
      const paramQuery = `SELECT * FROM template_parameters WHERE template_id = ? AND is_active = TRUE ORDER BY id`;
      const params = await db.query(paramQuery, [template.id]);
      template.parameters = params || [];
    } catch (error) {
      console.warn(`[Template] Parameters not available for template ${template.id}:`, error.message);
      template.parameters = [];
    }
  }

  return templates;
}

// Create new template with parameters
async function createTemplate(data) {
  const { name, equipment_type, brand, model, protocol, description, parameters } = data;

  const query = `
    INSERT INTO equipment_templates
    (name, equipment_type, brand, model, protocol, description, is_system)
    VALUES (?, ?, ?, ?, ?, ?, FALSE)
  `;

  const result = await db.query(query, [
    name,
    equipment_type,
    brand || null,
    model || null,
    protocol || 'snmp',
    description || null
  ]);

  const templateId = result.insertId;

  // Insert parameters
  if (parameters && parameters.length > 0) {
    for (const param of parameters) {
      try {
        await db.query(`
          INSERT INTO template_parameters
          (template_id, label, source, unit, warning_min, warning_max, alarm_min, alarm_max, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [
          templateId,
          param.label || param.name,
          param.source || param.parameter_key,
          param.unit || null,
          param.warning_min || null,
          param.warning_max || null,
          param.alarm_min || null,
          param.alarm_max || null
        ]);
      } catch (error) {
        console.warn(`[Template] Could not insert parameter ${param.label}:`, error.message);
        // Continue with other parameters
      }
    }
  }

  return getTemplateById(templateId);
}

// Update template
async function updateTemplate(id, data) {
  const { name, equipment_type, brand, model, protocol, description, parameters } = data;

  const query = `
    UPDATE equipment_templates
    SET name = ?, equipment_type = ?, brand = ?, model = ?, protocol = ?, description = ?
    WHERE id = ? AND is_system = FALSE
  `;

  await db.query(query, [
    name,
    equipment_type,
    brand || null,
    model || null,
    protocol || 'snmp',
    description || null,
    id
  ]);

  // Delete existing parameters
  try {
    await db.query('DELETE FROM template_parameters WHERE template_id = ?', [id]);
  } catch (error) {
    console.warn(`[Template] Could not delete parameters for template ${id}:`, error.message);
  }

  // Insert new parameters
  if (parameters && parameters.length > 0) {
    for (const param of parameters) {
      try {
        await db.query(`
          INSERT INTO template_parameters
          (template_id, label, source, unit, warning_min, warning_max, alarm_min, alarm_max, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        `, [
          id,
          param.label || param.name,
          param.source || param.parameter_key,
          param.unit || null,
          param.warning_min || null,
          param.warning_max || null,
          param.alarm_min || null,
          param.alarm_max || null
        ]);
      } catch (error) {
        console.warn(`[Template] Could not update parameter ${param.label}:`, error.message);
        // Continue with other parameters
      }
    }
  }

  return getTemplateById(id);
}

// Delete template (only non-system templates)
async function deleteTemplate(id) {
  const query = `DELETE FROM equipment_templates WHERE id = ? AND is_system = FALSE`;
  const result = await db.query(query, [id]);
  return result.affectedRows > 0;
}

// Get default template for equipment type
async function getDefaultTemplate(equipmentType) {
  const query = `
    SELECT * FROM equipment_templates
    WHERE equipment_type = ?
    ORDER BY is_system DESC, name ASC
    LIMIT 1
  `;
  const results = await db.query(query, [equipmentType]);
  if (!results[0]) return null;

  return getTemplateById(results[0].id);
}

module.exports = {
  getAllTemplates,
  getTemplateById,
  getTemplatesByType,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDefaultTemplate
};
