/**
 * Template Service - Equipment Templates CRUD with JSON Storage
 * TOC Project
 */

const db = require('../../db/database');

/**
 * Transforms internal JSON template into frontend-compatible format
 */
function transformToFrontend(template) {
  if (!template) return null;
  return {
    ...template,
    equipment_type: template.equipment_type || template.category || '',
    parsing_logic: template.parsing_logic || '',
    is_system: template.is_system !== undefined ? template.is_system : (template.isSystem || false),
    is_default: template.isDefault || false
  };
}

/**
 * Transforms frontend data into internal JSON format
 */
function transformFromFrontend(data) {
  return {
    id: data.id,
    name: data.name,
    category: data.equipment_type || data.category || '',
    brand: data.brand || '',
    model: data.model || '',
    protocol: data.protocol || 'snmp',
    description: data.description || '',
    parsing_logic: data.parsing_logic || '',
    parameters: data.parameters || [],
    isSystem: data.is_system !== undefined ? data.is_system : (data.isSystem || false),
    isDefault: data.is_default !== undefined ? data.is_default : (data.isDefault || false)
  };
}

// Get all templates
async function getAllTemplates() {
  const templates = await db.getAllSnmpTemplates();
  // Transform all
  const transformed = templates.map(transformToFrontend);
  
  // Sort: system first, then by name
  return transformed.sort((a, b) => {
    if (a.is_system && !b.is_system) return -1;
    if (!a.is_system && b.is_system) return 1;
    return a.name.localeCompare(b.name);
  });
}

// Get template by ID
async function getTemplateById(id) {
  const template = await db.getSnmpTemplateById(id);
  return transformToFrontend(template);
}

// Get templates by equipment type
async function getTemplatesByType(equipmentType) {
  const templates = await db.getAllSnmpTemplates();
  return templates
    .filter(t => t.category === equipmentType || t.equipment_type === equipmentType)
    .map(transformToFrontend);
}

// Create new template
async function createTemplate(data) {
  const jsonData = transformFromFrontend(data);
  const newTemplate = await db.createSnmpTemplate(jsonData);
  return transformToFrontend(newTemplate);
}

// Update template
async function updateTemplate(id, data) {
  const jsonData = transformFromFrontend(data);
  const updated = await db.updateSnmpTemplate(id, jsonData);
  return transformToFrontend(updated);
}

// Delete template
async function deleteTemplate(id) {
  return await db.deleteSnmpTemplate(id);
}

// Get default template for equipment type
async function getDefaultTemplate(equipmentType) {
  const templates = await db.getAllSnmpTemplates();
  const filtered = templates.filter(t => t.category === equipmentType || t.equipment_type === equipmentType);
  
  if (filtered.length === 0) return null;
  
  // Return the one marked as default, or the first one
  const template = filtered.find(t => t.isDefault) || filtered[0];
  return transformToFrontend(template);
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
