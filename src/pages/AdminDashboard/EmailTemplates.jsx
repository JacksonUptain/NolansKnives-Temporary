import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, remove, serverTimestamp, set } from 'firebase/database';
import { db } from '../firebase';
import { getEmailTemplateCatalog } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import LucideIcon from '../../components/ui/LucideIcon';
import '../AdminDashboard.css';

const premiumEmailStarterHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{campaignName}}</title>
  </head>
  <body style="margin:0;padding:0;background:#0a0a0a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0a0a0a;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;">
            <tr>
              <td style="padding:0 0 14px 2px;">
                <div style="color:#ffcc00;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:0.08em;line-height:1.2;text-transform:uppercase;">Nolan's Knives</div>
                <div style="margin-top:5px;color:#999999;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;">Custom handmade knives, built with purpose.</div>
              </td>
            </tr>
            <tr>
              <td style="background:#111111;border:1px solid #2b2b2b;border-radius:10px;overflow:hidden;">
                <div style="height:4px;background:#ffcc00;line-height:4px;font-size:4px;">&nbsp;</div>
                <div style="padding:28px 26px 24px;">
                  <div style="margin:0 0 10px;color:#d8b949;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:800;letter-spacing:0.06em;line-height:1.4;text-transform:uppercase;">Nolan's Knives</div>
                  <h1 style="margin:0 0 18px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;line-height:1.18;">{{campaignName}}</h1>
                  <p style="margin:0 0 16px;color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">Hi {{firstName}},</p>
                  <p style="margin:0 0 16px;color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">Write your main message here.</p>
                  <div style="margin:22px 0;padding:18px;background:#1a1a1a;border:1px solid #2b2b2b;border-radius:8px;">
                    <div style="margin:0 0 14px;color:#ffcc00;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.04em;line-height:1.4;text-transform:uppercase;">Key Details</div>
                    <p style="margin:0;color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">Add request, order, product, or campaign details here.</p>
                  </div>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
                    <tr>
                      <td style="border-radius:6px;background:#ffcc00;">
                        <a href="{{siteUrl}}" style="display:inline-block;padding:13px 20px;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:6px;">Primary Action</a>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="padding:18px 26px;background:#0a0a0a;border-top:1px solid #2b2b2b;">
                  <p style="margin:0;color:#999999;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;">Questions? Reply to this email or contact {{businessEmail}}.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

const emptyCustom = {
  id: '',
  label: '',
  description: '',
  subject: '',
  html: premiumEmailStarterHtml,
  variables: 'displayName, firstName, email, campaignName, siteUrl, businessEmail'
};

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseVariables(value) {
  if (Array.isArray(value)) return value;
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) return 'Not saved';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not saved';
  return date.toLocaleString();
}

function escapePreviewHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplatePreview(templateText = '', context = {}) {
  return String(templateText || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = key.split('.').reduce((current, part) => current?.[part], context);
    return escapePreviewHtml(value === null || value === undefined ? '' : value);
  });
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [customDraft, setCustomDraft] = useState(emptyCustom);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCatalog = async () => {
    try {
      const result = await getEmailTemplateCatalog();
      const list = result.templates || [];
      setTemplates(list);
      setSelectedId((current) => current || list[0]?.id || '');
      setError('');
    } catch (err) {
      const message = err?.message || 'Failed to load email templates.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    const unsub = onValue(ref(db, 'emailTemplates'), (snapshot) => {
      setOverrides(snapshot.exists() ? snapshot.val() || {} : {});
    });
    return () => unsub();
  }, []);

  const mergedTemplates = useMemo(() => templates.map((template) => {
    const override = overrides[template.id] || {};
    return {
      ...template,
      ...override,
      id: template.id,
      label: override.label || template.label,
      description: override.description || template.description,
      variables: override.variables || template.variables || [],
      mailgunTags: template.mailgunTags || [],
      subject: override.subject || template.subject || '',
      html: override.html || template.html || '',
      enabled: override.enabled !== false,
      effectiveSubject: override.subject || template.defaultSubject || template.effectiveSubject || '',
      effectiveHtml: override.html || template.defaultHtml || template.effectiveHtml || '',
      editableSubject: template.editableSubject || template.defaultSubject || '',
      editableHtml: template.editableHtml || template.defaultHtml || '',
      previewSubject: template.previewSubject || template.effectiveSubject || template.defaultSubject || '',
      previewHtml: template.previewHtml || template.effectiveHtml || template.defaultHtml || '',
      sampleContext: template.sampleContext || {},
      hasOverride: !!overrides[template.id]
    };
  }), [templates, overrides]);

  const filteredTemplates = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return mergedTemplates;
    return mergedTemplates.filter((template) => [
      template.id,
      template.label,
      template.description,
      ...(template.variables || [])
    ].join(' ').toLowerCase().includes(term));
  }, [mergedTemplates, searchTerm]);

  const selected = mergedTemplates.find((template) => template.id === selectedId) || mergedTemplates[0] || null;
  const currentDraft = draft?.id === selected?.id ? draft : selected ? {
    id: selected.id,
    label: selected.label || '',
    description: selected.description || '',
    variables: (selected.variables || []).join(', '),
    subject: selected.subject || selected.editableSubject || selected.defaultSubject || '',
    html: selected.html || selected.editableHtml || selected.defaultHtml || '',
    enabled: selected.enabled !== false,
    custom: selected.custom || false
  } : null;

  useEffect(() => {
    if (!selected) return;
    setDraft({
      id: selected.id,
      label: selected.label || '',
      description: selected.description || '',
      variables: (selected.variables || []).join(', '),
      subject: selected.subject || selected.editableSubject || selected.defaultSubject || '',
      html: selected.html || selected.editableHtml || selected.defaultHtml || '',
      enabled: selected.enabled !== false,
      custom: selected.custom || false
    });
  }, [selected]);

  const updateDraft = (field, value) => {
    setDraft((prev) => ({ ...(prev || {}), id: selected?.id, [field]: value }));
  };

  const saveTemplate = async () => {
    if (!selected || !currentDraft) return;
    if (!currentDraft.subject.trim() || !currentDraft.html.trim()) {
      showToast('Subject and HTML are required.', 'error');
      return;
    }

    try {
      setSaving(true);
      await set(ref(db, `emailTemplates/${selected.id}`), {
        label: currentDraft.label.trim() || selected.label,
        description: currentDraft.description.trim(),
        variables: parseVariables(currentDraft.variables),
        subject: currentDraft.subject,
        html: currentDraft.html,
        enabled: currentDraft.enabled !== false,
        custom: currentDraft.custom || selected.custom || false,
        updatedAt: serverTimestamp()
      });
      showToast('Email template saved.', 'success');
      await loadCatalog();
    } catch (err) {
      const message = err?.message || 'Failed to save template.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = async () => {
    if (!selected) return;
    await showConfirm(
      'Reset Template',
      `Reset "${selected.label}" back to its code default?`,
      async () => {
        await remove(ref(db, `emailTemplates/${selected.id}`));
        setDraft(null);
        showToast('Template reset to default.', 'success');
        await loadCatalog();
      }
    );
  };

  const createCustomTemplate = async (event) => {
    event.preventDefault();
    const id = slugify(customDraft.id || customDraft.label);
    if (!id || !customDraft.label.trim() || !customDraft.subject.trim() || !customDraft.html.trim()) {
      showToast('Template ID, label, subject, and HTML are required.', 'error');
      return;
    }

    try {
      setSaving(true);
      await set(ref(db, `emailTemplates/${id}`), {
        label: customDraft.label.trim(),
        description: customDraft.description.trim(),
        variables: parseVariables(customDraft.variables),
        subject: customDraft.subject,
        html: customDraft.html,
        enabled: true,
        custom: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setCustomDraft(emptyCustom);
      setSelectedId(id);
      showToast('Custom template created.', 'success');
      await loadCatalog();
    } catch (err) {
      showToast(err?.message || 'Failed to create custom template.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const loadDefaultIntoEditor = () => {
    if (!selected) return;
    setDraft((prev) => ({
      ...(prev || {}),
      id: selected.id,
      subject: selected.editableSubject || selected.defaultSubject || selected.effectiveSubject || '',
      html: selected.editableHtml || selected.defaultHtml || selected.effectiveHtml || ''
    }));
    showToast('Default loaded into editor.', 'info');
  };

  const previewSubject = currentDraft
    ? renderTemplatePreview(currentDraft.subject || '', selected?.sampleContext || {})
    : '';
  const previewHtml = currentDraft
    ? renderTemplatePreview(currentDraft.html || '', selected?.sampleContext || {})
    : '';

  if (loading) return <div className="admin-dashboard-page"><div className="loading-shimmer">Loading templates...</div></div>;

  return (
    <div className="admin-dashboard-page email-templates-page">
      <div className="dashboard-header">
        <h1>Email Templates</h1>
        <p>Edit transactional and campaign emails at the HTML level.</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="template-workspace">
        <aside className="template-list-panel">
          <label className="admin-search">
            <LucideIcon name="Search" size={16} />
            <input placeholder="Search templates" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </label>

          <div className="template-list">
            {filteredTemplates.map((template) => (
              <button
                type="button"
                key={template.id}
                className={`template-list-item ${selected?.id === template.id ? 'active' : ''}`}
                onClick={() => setSelectedId(template.id)}
              >
                <strong>{template.label}</strong>
                <span>{template.id}</span>
                {template.hasOverride && <em>Saved override</em>}
              </button>
            ))}
          </div>
        </aside>

        {selected && currentDraft && (
          <section className="template-editor-panel">
            <div className="template-editor-header">
              <div>
                <h2>{selected.label}</h2>
                <small>{selected.custom ? 'Custom template' : 'System template'}</small>
                <p>{selected.description || 'No description yet.'}</p>
                <small>Last saved: {formatDate(selected.updatedAt)}</small>
              </div>
              <div className="template-header-actions">
                <button className="action-btn secondary" type="button" onClick={loadDefaultIntoEditor}>
                  <LucideIcon name="RefreshCw" size={15} /> Load Default
                </button>
                <button className="action-btn danger" type="button" onClick={resetTemplate} disabled={!selected.hasOverride}>
                  <LucideIcon name="RotateCcw" size={15} /> Reset
                </button>
                <button className="action-btn" type="button" onClick={saveTemplate} disabled={saving}>
                  <LucideIcon name="Save" size={15} /> {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>

            <div className="template-variable-row">
              {(selected.variables || []).map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}
            </div>

            {selected.mailgunTags?.length > 0 && (
              <div className="template-tag-block">
                <span>Mailgun tags</span>
                <div className="template-variable-row compact-tags">
                  {selected.mailgunTags.map((tag) => <code key={tag}>{tag}</code>)}
                </div>
              </div>
            )}

            <div className="template-form-grid">
              <label>
                Label
                <input className="input-field" value={currentDraft.label} onChange={(event) => updateDraft('label', event.target.value)} />
              </label>
              <label>
                Variables
                <input className="input-field" value={currentDraft.variables} onChange={(event) => updateDraft('variables', event.target.value)} />
              </label>
              <label className="template-span-2">
                Description
                <input className="input-field" value={currentDraft.description} onChange={(event) => updateDraft('description', event.target.value)} />
              </label>
              <label className="template-span-2">
                Subject
                <input className="input-field" value={currentDraft.subject} onChange={(event) => updateDraft('subject', event.target.value)} />
              </label>
              <label className="template-span-2 editor-check inline">
                <input type="checkbox" checked={currentDraft.enabled !== false} onChange={(event) => updateDraft('enabled', event.target.checked)} />
                Enabled
              </label>
            </div>

            <div className="html-editor-grid">
              <label>
                HTML
                <textarea className="input-field code-editor" value={currentDraft.html} onChange={(event) => updateDraft('html', event.target.value)} spellCheck={false} />
              </label>
              <div className="template-preview">
                <div className="template-preview-subject">{previewSubject || 'No subject'}</div>
                <iframe title="Email template preview" srcDoc={previewHtml || '<p>No HTML yet.</p>'} />
              </div>
            </div>
          </section>
        )}
      </div>

      <form className="editor-create-panel custom-template-create" onSubmit={createCustomTemplate}>
        <h2>Create Custom Campaign Template</h2>
        <input className="input-field" placeholder="Template ID" value={customDraft.id} onChange={(event) => setCustomDraft((prev) => ({ ...prev, id: slugify(event.target.value) }))} />
        <input className="input-field" placeholder="Label" value={customDraft.label} onChange={(event) => setCustomDraft((prev) => ({ ...prev, label: event.target.value }))} required />
        <input className="input-field" placeholder="Subject" value={customDraft.subject} onChange={(event) => setCustomDraft((prev) => ({ ...prev, subject: event.target.value }))} required />
        <input className="input-field" placeholder="Variables" value={customDraft.variables} onChange={(event) => setCustomDraft((prev) => ({ ...prev, variables: event.target.value }))} />
        <textarea className="input-field" placeholder="Description" value={customDraft.description} onChange={(event) => setCustomDraft((prev) => ({ ...prev, description: event.target.value }))} />
        <textarea className="input-field code-editor short" placeholder="HTML" value={customDraft.html} onChange={(event) => setCustomDraft((prev) => ({ ...prev, html: event.target.value }))} required />
        <button className="action-btn" disabled={saving}><LucideIcon name="Plus" size={16} /> Create Template</button>
      </form>
    </div>
  );
}
