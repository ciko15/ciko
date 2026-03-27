/**
 * Template Management JavaScript
 * TOC Project - Equipment Templates UI
 */

var API_URL = window.API_URL || '/api';
var liveDataTimer = window.liveDataTimer;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  authToken = localStorage.getItem('authToken');
  // Don't load immediately, wait for section to be visible
  // loadTemplates();
  initTemplateForm();

  // Add template button
  const addTemplateBtn = document.getElementById('addTemplateBtn');
  if (addTemplateBtn) {
    addTemplateBtn.addEventListener('click', () => openTemplateModal('Add Equipment Template'));
  }

  // Close modal buttons
  const closeTemplateModalBtn = document.getElementById('closeTemplateModal');
  if (closeTemplateModalBtn) {
    closeTemplateModalBtn.addEventListener('click', closeTemplateModal);
  }

  const cancelTemplateEditBtn = document.getElementById('cancelTemplateEdit');
  if (cancelTemplateEditBtn) {
    cancelTemplateEditBtn.addEventListener('click', closeTemplateModal);
  }

  const closeTemplateDetailModalBtn = document.getElementById('closeTemplateDetailModal');
  if (closeTemplateDetailModalBtn) {
    closeTemplateDetailModalBtn.addEventListener('click', () => {
      document.getElementById('templateDetailModal').classList.add('hidden');
    });
  }
});

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

// Load templates
async function loadTemplates() {
  const tableBody = document.getElementById('templateTableBody');
  if (!tableBody) return;

  try {
    const response = await fetch(`${API_URL}/templates`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to load templates');

    const templates = await response.json();
    renderTemplateTable(templates);
  } catch (error) {
    console.error('Error loading templates:', error);
    tableBody.innerHTML = `<tr><td colspan="7" class="error-state">Error: ${error.message}</td></tr>`;
  }
}

// Render template table
function renderTemplateTable(templates) {
  const tableBody = document.getElementById('templateTableBody');
  if (!tableBody) return;

  if (!templates || templates.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" class="empty-state">No templates available</td></tr>`;
    return;
  }

  tableBody.innerHTML = templates.map(template => `
    <tr>
      <td><strong>${template.name}</strong></td>
      <td><span class="category-badge ${template.equipment_type?.toLowerCase() || 'support'}">${template.equipment_type || '-'}</span></td>
      <td>${template.brand || '-'}</td>
      <td>${template.model || '-'}</td>
      <td>${template.is_system ? '<span class="system-badge">System</span>' : '<span class="custom-badge">Custom</span>'}</td>
      <td>${template.description || '-'}</td>
      <td>
        <div class="action-buttons">
          <button class="btn-view" onclick="viewTemplate(${template.id})" title="View">
            <i class="fas fa-eye"></i>
          </button>
          ${!template.is_system ? `
          <button class="btn-edit" onclick="editTemplate(${template.id})" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-delete" onclick="deleteTemplate(${template.id})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');
}

// Initialize template form
function initTemplateForm() {
  const form = document.getElementById('templateForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveTemplate();
  });

  // Add parameter row button
  const addParamBtn = document.getElementById('addParameterBtn');
  if (addParamBtn) {
    addParamBtn.addEventListener('click', () => addParameterRow());
  }
}

// Add parameter row for smart templates
function addParameterRow() {
  const container = document.getElementById('parameterContainer');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'parameter-row';
  row.innerHTML = `
    <div class="parameter-form-row">
      <div class="form-group">
        <label>Parameter Label</label>
        <input type="text" name="paramLabel" placeholder="e.g., Temperature" required>
      </div>
      <div class="form-group">
        <label>Source (OID/Register/Key)</label>
        <input type="text" name="paramSource" placeholder="e.g., 1.3.6.1.4.1.50000.1" required>
      </div>
      <div class="form-group">
        <label>Unit</label>
        <input type="text" name="paramUnit" placeholder="e.g., °C, V, Hz, %" value="">
      </div>
      <div class="threshold-group">
        <div class="form-group">
          <label>Warning Min</label>
          <input type="number" step="0.01" name="warningMin" placeholder="Min warning value">
        </div>
        <div class="form-group">
          <label>Warning Max</label>
          <input type="number" step="0.01" name="warningMax" placeholder="Max warning value">
        </div>
        <div class="form-group">
          <label>Alarm Min</label>
          <input type="number" step="0.01" name="alarmMin" placeholder="Min alarm value">
        </div>
        <div class="form-group">
          <label>Alarm Max</label>
          <input type="number" step="0.01" name="alarmMax" placeholder="Max alarm value">
        </div>
      </div>
      <button type="button" class="btn-remove-param" onclick="this.parentElement.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  container.appendChild(row);
}

// Save template with parameters
async function saveTemplate() {
  const id = document.getElementById('templateId').value;
  const name = document.getElementById('templateName').value;
  const equipmentType = document.getElementById('templateEquipmentType').value;
  const brand = document.getElementById('templateBrand').value;
  const model = document.getElementById('templateModel').value;
  const protocol = document.getElementById('templateProtocol').value;
  const description = document.getElementById('templateDescription').value;

  // Parse parameter rows
  const paramRows = document.querySelectorAll('.parameter-row');
  const parameters = [];

  paramRows.forEach(row => {
    const label = row.querySelector('[name="paramLabel"]').value;
    const source = row.querySelector('[name="paramSource"]').value;
    const unit = row.querySelector('[name="paramUnit"]').value;
    const warningMin = row.querySelector('[name="warningMin"]').value;
    const warningMax = row.querySelector('[name="warningMax"]').value;
    const alarmMin = row.querySelector('[name="alarmMin"]').value;
    const alarmMax = row.querySelector('[name="alarmMax"]').value;

    if (label && source) {
      parameters.push({
        label,
        source,
        unit: unit || null,
        warning_min: warningMin ? parseFloat(warningMin) : null,
        warning_max: warningMax ? parseFloat(warningMax) : null,
        alarm_min: alarmMin ? parseFloat(alarmMin) : null,
        alarm_max: alarmMax ? parseFloat(alarmMax) : null
      });
    }
  });

  const templateData = {
    name,
    equipment_type: equipmentType,
    brand: brand || null,
    model: model || null,
    protocol: protocol || 'snmp',
    description: description || null,
    parameters
  };

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/templates/${id}` : `${API_URL}/templates`;

    const response = await fetch(url, {
      method,
      headers: getAuthHeaders(),
      body: JSON.stringify(templateData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save template');
    }

    const result = await response.json();
    alert(`Template ${id ? 'updated' : 'created'} successfully!`);
    loadTemplates();
    closeTemplateModal();

  } catch (error) {
    console.error('Error saving template:', error);
    alert(`Error: ${error.message}`);
  }
}

// View template
window.viewTemplate = async function(id) {
  try {
    const response = await fetch(`${API_URL}/templates/${id}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to load template');

    const template = await response.json();

    const modal = document.getElementById('templateDetailModal');
    const content = document.getElementById('templateDetailContent');

    if (!modal || !content) return;

    const parameters = template.parameters || [];

    let paramsHtml = '<table style="width:100%; font-size:0.85rem;"><thead><tr><th>Label</th><th>Source</th><th>Unit</th><th>Warning Min</th><th>Warning Max</th><th>Alarm Min</th><th>Alarm Max</th></tr></thead><tbody>';
    parameters.forEach(p => {
      paramsHtml += `<tr>
        <td>${p.label}</td>
        <td>${p.source}</td>
        <td>${p.unit || '-'}</td>
        <td>${p.warning_min || '-'}</td>
        <td>${p.warning_max || '-'}</td>
        <td>${p.alarm_min || '-'}</td>
        <td>${p.alarm_max || '-'}</td>
      </tr>`;
    });
    paramsHtml += '</tbody></table>';

    content.innerHTML = `
      <div class="template-detail-header">
        <h3>${template.name}</h3>
        <span class="category-badge ${template.equipment_type?.toLowerCase() || 'support'}">${template.equipment_type || '-'}</span>
      </div>
      <div class="template-detail-info">
        <div><strong>Brand:</strong> ${template.brand || '-'}</div>
        <div><strong>Model:</strong> ${template.model || '-'}</div>
        <div><strong>Protocol:</strong> ${template.protocol || 'snmp'}</div>
        <div><strong>Type:</strong> ${template.is_system ? 'System' : 'Custom'}</div>
      </div>
      <div class="template-detail-desc">
        <strong>Description:</strong> ${template.description || 'No description'}
      </div>
      <div class="template-detail-mappings">
        <h4>Parameters & Thresholds (${parameters.length})</h4>
        ${paramsHtml}
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (error) {
    console.error('Error loading template:', error);
    alert('Error loading template');
  }
};

// Edit template
window.editTemplate = async function(id) {
  try {
    const response = await fetch(`${API_URL}/templates/${id}`, {
      headers: getAuthHeaders()
    });

    if (!response.ok) throw new Error('Failed to load template');

    const template = await response.json();

    document.getElementById('templateId').value = template.id;
    document.getElementById('templateName').value = template.name;
    document.getElementById('templateEquipmentType').value = template.equipment_type || '';
    document.getElementById('templateBrand').value = template.brand || '';
    document.getElementById('templateModel').value = template.model || '';
    document.getElementById('templateProtocol').value = template.protocol || 'snmp';
    document.getElementById('templateDescription').value = template.description || '';

    // Clear existing parameters
    const container = document.getElementById('parameterContainer');
    container.innerHTML = '';

    // Add existing parameters
    const parameters = template.parameters || [];
    parameters.forEach(param => {
      const row = document.createElement('div');
      row.className = 'parameter-row';
      row.innerHTML = `
        <div class="parameter-form-row">
          <div class="form-group">
            <label>Parameter Label</label>
            <input type="text" name="paramLabel" placeholder="e.g., Temperature" value="${param.label}" required>
          </div>
          <div class="form-group">
            <label>Source (OID/Register/Key)</label>
            <input type="text" name="paramSource" placeholder="e.g., 1.3.6.1.4.1.50000.1" value="${param.source}" required>
          </div>
          <div class="form-group">
            <label>Unit</label>
            <input type="text" name="paramUnit" placeholder="e.g., °C, V, Hz, %" value="${param.unit || ''}">
          </div>
          <div class="threshold-group">
            <div class="form-group">
              <label>Warning Min</label>
              <input type="number" step="0.01" name="warningMin" placeholder="Min warning value" value="${param.warning_min || ''}">
            </div>
            <div class="form-group">
              <label>Warning Max</label>
              <input type="number" step="0.01" name="warningMax" placeholder="Max warning value" value="${param.warning_max || ''}">
            </div>
            <div class="form-group">
              <label>Alarm Min</label>
              <input type="number" step="0.01" name="alarmMin" placeholder="Min alarm value" value="${param.alarm_min || ''}">
            </div>
            <div class="form-group">
              <label>Alarm Max</label>
              <input type="number" step="0.01" name="alarmMax" placeholder="Max alarm value" value="${param.alarm_max || ''}">
            </div>
          </div>
          <button type="button" class="btn-remove-param" onclick="this.parentElement.parentElement.remove()">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
      container.appendChild(row);
    });

    openTemplateModal('Edit Template');
  } catch (error) {
    console.error('Error loading template:', error);
    alert('Error loading template');
  }
};

// Delete template
window.deleteTemplate = async function(id) {
  if (!confirm('Are you sure you want to delete this template?')) return;

  try {
    const response = await fetch(`${API_URL}/templates/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (response.ok) {
      loadTemplates();
      alert('Template deleted successfully');
    } else {
      const data = await response.json();
      alert(data.message || 'Error deleting template');
    }
  } catch (error) {
    console.error('Error deleting template:', error);
    alert('Error deleting template');
  }
};

// Modal functions
function openTemplateModal(title = 'Add Template') {
  const modal = document.getElementById('templateModal');
  const formTitle = document.getElementById('templateModalFormTitle');
  
  if (modal) {
    formTitle.textContent = title;
    modal.classList.remove('hidden');
  }
}

function closeTemplateModal() {
  const modal = document.getElementById('templateModal');
  if (modal) {
    modal.classList.add('hidden');
    resetTemplateForm();
  }
}

function resetTemplateForm() {
  const form = document.getElementById('templateForm');
  if (form) form.reset();

  document.getElementById('templateId').value = '';

  const container = document.getElementById('parameterContainer');
  if (container) container.innerHTML = '';
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('templateModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeTemplateModal();
    });
  }
  
  const detailModal = document.getElementById('templateDetailModal');
  if (detailModal) {
    detailModal.addEventListener('click', (e) => {
      if (e.target === detailModal) detailModal.classList.add('hidden');
    });
  }
  
  // Add template button
  const addBtn = document.getElementById('addTemplateBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => openTemplateModal());
  }
  
  // Close buttons
  const closeBtn = document.getElementById('closeTemplateModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeTemplateModal);
  }
});
