import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, push, remove, serverTimestamp, set } from 'firebase/database';
import { db } from '../firebase';
import { getEmailTemplateCatalog, sendEmailCampaign } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import LucideIcon from '../../components/ui/LucideIcon';
import '../BusinessDashboard.css';

const roleOptions = ['all', 'customer', 'business', 'admin'];
const FLOW_STEPS = [
  { id: 'audience', label: 'Audience', icon: 'Users' },
  { id: 'message', label: 'Message', icon: 'Mail' },
  { id: 'preview', label: 'Preview', icon: 'Eye' },
  { id: 'send', label: 'Send', icon: 'Send' }
];

function formatDate(value) {
  if (!value) return 'No date';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleString();
}

function normalizeMembers(value) {
  if (!value) return {};
  if (Array.isArray(value)) {
    return value.filter(Boolean).reduce((acc, uid) => ({ ...acc, [uid]: true }), {});
  }
  return value;
}

function slugStatus(value) {
  return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function userLabel(user) {
  return user.displayName || user.email || user.uid;
}

function isSuppressedUser(user = {}) {
  const suppressionStatus = user.emailSuppression?.status || '';
  return user.emailPreferences?.marketingSubscribed === false ||
    ['unsubscribed', 'complained', 'permanent_failure'].includes(suppressionStatus);
}

function normalizeEmailInput(value = '') {
  return String(value || '').trim().toLowerCase();
}

function isValidEmailInput(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmailInput(value));
}

function parseManualRecipients(value = '') {
  const text = String(value || '');
  const recipients = new Map();
  const addRecipient = ({ email, displayName = '' }) => {
    const normalizedEmail = normalizeEmailInput(email);
    if (!isValidEmailInput(normalizedEmail)) return;
    const name = String(displayName || '').trim().replace(/^["']|["']$/g, '');
    recipients.set(normalizedEmail, {
      email: normalizedEmail,
      displayName: name || normalizedEmail.split('@')[0],
      manual: true
    });
  };

  const anglePattern = /([^<>\n;,]*?)<([^<>\s@]+@[^\s<>@]+\.[^\s<>@]+)>/g;
  let remaining = text.replace(anglePattern, (_match, name, email) => {
    addRecipient({ email, displayName: name });
    return ' ';
  });

  remaining
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((email) => addRecipient({ email }));

  return [...recipients.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export default function EmailCampaigns() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('compose');
  const [flowStep, setFlowStep] = useState('audience');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [selectedUids, setSelectedUids] = useState({});
  const [selectedGroupIds, setSelectedGroupIds] = useState({});
  const [mode, setMode] = useState('template');
  const [templateId, setTemplateId] = useState('campaignGeneral');
  const [campaignName, setCampaignName] = useState("Nolan's Knives Update");
  const [customSubject, setCustomSubject] = useState('');
  const [customHtml, setCustomHtml] = useState('<h2>{{campaignName}}</h2>\n<p>Hi {{firstName}},</p>\n<p></p>');
  const [manualRecipientText, setManualRecipientText] = useState('');
  const [groupDraft, setGroupDraft] = useState({ name: '', description: '', members: {} });
  const [editingGroupId, setEditingGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let usersLoaded = false;
    let groupsLoaded = false;
    let campaignsLoaded = false;

    const finish = () => {
      if (usersLoaded && groupsLoaded && campaignsLoaded) setLoading(false);
    };

    const unsubUsers = onValue(ref(db, 'users'), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([uid, value]) => ({ uid, ...value }))
        : [];
      list.sort((a, b) => userLabel(a).localeCompare(userLabel(b)));
      setUsers(list);
      usersLoaded = true;
      finish();
    }, (err) => {
      setError(err?.message || 'Failed to load users');
      usersLoaded = true;
      finish();
    });

    const unsubGroups = onValue(ref(db, 'emailGroups'), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([groupId, value]) => ({ groupId, ...value, members: normalizeMembers(value.members) }))
        : [];
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setGroups(list);
      groupsLoaded = true;
      finish();
    }, (err) => {
      setError(err?.message || 'Failed to load groups');
      groupsLoaded = true;
      finish();
    });

    const unsubCampaigns = onValue(ref(db, 'emailCampaigns'), (snapshot) => {
      const list = snapshot.exists()
        ? Object.entries(snapshot.val()).map(([campaignId, value]) => ({ campaignId, ...value }))
        : [];
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setCampaigns(list);
      campaignsLoaded = true;
      finish();
    }, (err) => {
      setError(err?.message || 'Failed to load campaign history');
      campaignsLoaded = true;
      finish();
    });

    getEmailTemplateCatalog()
      .then((result) => {
        const list = (result.templates || []).filter((template) => template.enabled !== false);
        setTemplates(list);
        if (!list.some((template) => template.id === 'campaignGeneral')) {
          setTemplateId(list[0]?.id || '');
        }
      })
      .catch((err) => setError(err?.message || 'Failed to load templates.'));

    return () => {
      unsubUsers();
      unsubGroups();
      unsubCampaigns();
    };
  }, []);

  const groupById = useMemo(() => groups.reduce((acc, group) => ({ ...acc, [group.groupId]: group }), {}), [groups]);
  const userById = useMemo(() => users.reduce((acc, user) => ({ ...acc, [user.uid]: user }), {}), [users]);
  const activeTemplate = templates.find((template) => template.id === templateId) || templates[0] || null;

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const label = [user.displayName, user.email, user.role, user.uid].join(' ').toLowerCase();
      const matchesSearch = !term || label.includes(term);
      const matchesRole = roleFilter === 'all' || (user.role || 'customer') === roleFilter;
      const matchesGroup = groupFilter === 'all' || !!groupById[groupFilter]?.members?.[user.uid];
      return matchesSearch && matchesRole && matchesGroup && user.email && user.status !== 'blocked' && !isSuppressedUser(user);
    });
  }, [users, searchTerm, roleFilter, groupFilter, groupById]);

  const selectedRecipientUids = useMemo(() => {
    const ids = new Set(Object.keys(selectedUids).filter((uid) => selectedUids[uid]));
    Object.keys(selectedGroupIds).filter((id) => selectedGroupIds[id]).forEach((groupId) => {
      Object.keys(groupById[groupId]?.members || {}).forEach((uid) => ids.add(uid));
    });
    return [...ids].filter((uid) => userById[uid]?.email && userById[uid]?.status !== 'blocked' && !isSuppressedUser(userById[uid]));
  }, [selectedUids, selectedGroupIds, groupById, userById]);

  const selectedDirectUids = useMemo(() => Object.keys(selectedUids).filter((uid) => selectedUids[uid]), [selectedUids]);
  const selectedGroupIdList = useMemo(() => Object.keys(selectedGroupIds).filter((id) => selectedGroupIds[id]), [selectedGroupIds]);
  const selectedGroups = useMemo(() => selectedGroupIdList.map((id) => groupById[id]).filter(Boolean), [selectedGroupIdList, groupById]);
  const manualRecipients = useMemo(() => parseManualRecipients(manualRecipientText), [manualRecipientText]);
  const selectedUserEmailSet = useMemo(() => new Set(
    selectedRecipientUids
      .map((uid) => normalizeEmailInput(userById[uid]?.email))
      .filter(Boolean)
  ), [selectedRecipientUids, userById]);
  const selectedRecipientCount = useMemo(() => {
    const emailSet = new Set(selectedUserEmailSet);
    manualRecipients.forEach((recipient) => emailSet.add(recipient.email));
    return emailSet.size;
  }, [selectedUserEmailSet, manualRecipients]);
  const selectedManualRecipients = useMemo(
    () => manualRecipients.filter((recipient) => !selectedUserEmailSet.has(recipient.email)),
    [manualRecipients, selectedUserEmailSet]
  );
  const previewSubject = mode === 'template' ? activeTemplate?.effectiveSubject || activeTemplate?.subject || '' : customSubject;
  const previewHtml = mode === 'template' ? activeTemplate?.effectiveHtml || activeTemplate?.html || '<p>No template selected.</p>' : customHtml;
  const hasRecipients = selectedRecipientCount > 0;
  const hasMessage = mode === 'template' ? !!templateId : !!customSubject.trim() && !!customHtml.trim();
  const flowStepIndex = Math.max(FLOW_STEPS.findIndex((step) => step.id === flowStep), 0);
  const selectedPreviewUsers = selectedRecipientUids.slice(0, 8).map((uid) => userById[uid]).filter(Boolean);
  const selectedPreviewManualRecipients = selectedManualRecipients.slice(0, Math.max(0, 8 - selectedPreviewUsers.length));
  const hiddenPreviewRecipientCount = Math.max(selectedRecipientCount - selectedPreviewUsers.length - selectedPreviewManualRecipients.length, 0);
  const messageLabel = mode === 'template' ? activeTemplate?.label || 'Template' : 'Custom HTML';

  const getFlowStepClass = (step, index) => {
    const complete = (step.id === 'audience' && hasRecipients) ||
      (step.id === 'message' && hasMessage) ||
      (index < flowStepIndex);
    return [
      'campaign-flow-step',
      step.id === flowStep ? 'is-active' : '',
      complete ? 'is-complete' : ''
    ].filter(Boolean).join(' ');
  };

  const goToFlowStep = (stepId) => {
    const targetIndex = FLOW_STEPS.findIndex((step) => step.id === stepId);
    if (targetIndex > 0 && !hasRecipients) {
      showToast('Select at least one recipient first.', 'error');
      return;
    }
    if (targetIndex > 1 && !hasMessage) {
      showToast('Choose a template or add custom email HTML first.', 'error');
      return;
    }
    setFlowStep(stepId);
  };

  const nextFlowStep = () => {
    const nextStep = FLOW_STEPS[Math.min(flowStepIndex + 1, FLOW_STEPS.length - 1)];
    if (nextStep) goToFlowStep(nextStep.id);
  };

  const previousFlowStep = () => {
    const previousStep = FLOW_STEPS[Math.max(flowStepIndex - 1, 0)];
    if (previousStep) setFlowStep(previousStep.id);
  };

  const toggleUid = (uid) => {
    setSelectedUids((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const toggleGroup = (groupId) => {
    setSelectedGroupIds((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const selectAllFiltered = () => {
    setSelectedUids((prev) => {
      const next = { ...prev };
      filteredUsers.forEach((user) => {
        next[user.uid] = true;
      });
      return next;
    });
  };

  const clearRecipients = () => {
    setSelectedUids({});
    setSelectedGroupIds({});
    setManualRecipientText('');
  };

  const copyTemplateToCustom = () => {
    if (!activeTemplate) return;
    setMode('custom');
    setCustomSubject(activeTemplate.effectiveSubject || activeTemplate.subject || '');
    setCustomHtml(activeTemplate.effectiveHtml || activeTemplate.html || '');
    showToast('Template copied into custom email.', 'info');
  };

  const handleSend = async () => {
    const payload = {
      campaignName,
      recipientUids: selectedDirectUids,
      groupIds: selectedGroupIdList,
      manualRecipients,
      mode,
      templateId,
      subject: customSubject,
      html: customHtml
    };

    if (selectedRecipientCount === 0) {
      showToast('Select at least one recipient.', 'error');
      return;
    }
    if (mode === 'custom' && (!customSubject.trim() || !customHtml.trim())) {
      showToast('Custom subject and HTML are required.', 'error');
      return;
    }
    if (mode === 'template' && !templateId) {
      showToast('Choose a template.', 'error');
      return;
    }

    await showConfirm(
      'Send Email Campaign',
      `Send "${campaignName || 'this campaign'}" to ${selectedRecipientCount} recipient${selectedRecipientCount === 1 ? '' : 's'}?`,
      async () => {
        try {
          setSending(true);
          setError('');
          const result = await sendEmailCampaign(payload);
          showToast(`Campaign sent to ${result.successCount || 0} recipient${result.successCount === 1 ? '' : 's'}.`, result.failureCount ? 'warning' : 'success');
          if (!result.failureCount) clearRecipients();
        } catch (err) {
          const message = err?.message || 'Failed to send campaign.';
          setError(message);
          showToast(message, 'error');
        } finally {
          setSending(false);
        }
      }
    );
  };

  const startEditGroup = (group) => {
    setEditingGroupId(group.groupId);
    setGroupDraft({
      name: group.name || '',
      description: group.description || '',
      members: normalizeMembers(group.members)
    });
    setActiveTab('groups');
  };

  const toggleGroupDraftMember = (uid) => {
    setGroupDraft((prev) => ({
      ...prev,
      members: {
        ...(prev.members || {}),
        [uid]: !prev.members?.[uid]
      }
    }));
  };

  const saveGroup = async (event) => {
    event.preventDefault();
    if (!groupDraft.name.trim()) {
      showToast('Group name is required.', 'error');
      return;
    }

    try {
      setSavingGroup(true);
      const groupRef = editingGroupId ? ref(db, `emailGroups/${editingGroupId}`) : push(ref(db, 'emailGroups'));
      await set(groupRef, {
        name: groupDraft.name.trim(),
        description: groupDraft.description.trim(),
        members: Object.fromEntries(Object.entries(groupDraft.members || {}).filter(([, selected]) => selected)),
        updatedAt: serverTimestamp(),
        createdAt: editingGroupId ? groupById[editingGroupId]?.createdAt || serverTimestamp() : serverTimestamp()
      });
      setGroupDraft({ name: '', description: '', members: {} });
      setEditingGroupId('');
      showToast(editingGroupId ? 'Group saved.' : 'Group created.', 'success');
    } catch (err) {
      showToast(err?.message || 'Failed to save group.', 'error');
    } finally {
      setSavingGroup(false);
    }
  };

  const deleteGroup = async (group) => {
    await showConfirm(
      'Delete Email Group',
      `Delete "${group.name}"? Existing campaign history will remain.`,
      async () => {
        await remove(ref(db, `emailGroups/${group.groupId}`));
        if (editingGroupId === group.groupId) {
          setEditingGroupId('');
          setGroupDraft({ name: '', description: '', members: {} });
        }
        setSelectedGroupIds((prev) => {
          const next = { ...prev };
          delete next[group.groupId];
          return next;
        });
        showToast('Group deleted.', 'success');
      }
    );
  };

  const addGroupToCampaign = (group) => {
    setSelectedGroupIds((prev) => ({ ...prev, [group.groupId]: true }));
    setActiveTab('compose');
    setFlowStep('message');
    showToast(`${group.name} added to the campaign.`, 'success');
  };

  if (loading) return <div className="business-workspace"><div className="loading-shimmer">Loading email campaigns...</div></div>;

  return (
    <div className="business-workspace email-campaign-page">
      <div className="workspace-hero">
        <div>
          <h1>Campaigns</h1>
          <p>Select customers, groups, or individual users, then send a reusable template or pasted HTML email.</p>
        </div>
        <button
          className="action-btn workspace-primary-action"
          onClick={() => {
            setActiveTab('compose');
            goToFlowStep('send');
          }}
          disabled={sending}
        >
          <LucideIcon name="Eye" size={16} /> Review Campaign
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats">
        <div className="stat-card compact"><span>Recipients</span><strong>{selectedRecipientCount}</strong></div>
        <div className="stat-card compact"><span>Groups</span><strong>{selectedGroups.length}</strong></div>
        <div className="stat-card compact"><span>Manual</span><strong>{selectedManualRecipients.length}</strong></div>
        <div className="stat-card compact"><span>Templates</span><strong>{templates.length}</strong></div>
      </div>

      <div className="editor-tabs business-tabs">
        <button className={activeTab === 'compose' ? 'active' : ''} onClick={() => setActiveTab('compose')}>Compose</button>
        <button className={activeTab === 'groups' ? 'active' : ''} onClick={() => setActiveTab('groups')}>Groups</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History</button>
      </div>

      {activeTab === 'compose' && (
        <section className="campaign-flow">
          <div className="campaign-flow-steps" aria-label="Campaign steps">
            {FLOW_STEPS.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={getFlowStepClass(step, index)}
                onClick={() => goToFlowStep(step.id)}
              >
                <span className="campaign-step-index">
                  {index < flowStepIndex || (step.id === 'audience' && hasRecipients) || (step.id === 'message' && hasMessage) ? (
                    <LucideIcon name="Check" size={14} />
                  ) : (
                    index + 1
                  )}
                </span>
                <LucideIcon name={step.icon} size={16} />
                <span>{step.label}</span>
              </button>
            ))}
          </div>

          <div className="campaign-selection-strip">
            <div>
              <span>Recipients</span>
              <strong>{selectedRecipientCount}</strong>
            </div>
            <div>
              <span>Direct</span>
              <strong>{selectedDirectUids.length}</strong>
            </div>
            <div>
              <span>Groups</span>
              <strong>{selectedGroups.length}</strong>
            </div>
            <div>
              <span>Manual</span>
              <strong>{selectedManualRecipients.length}</strong>
            </div>
            <div>
              <span>Message</span>
              <strong>{messageLabel}</strong>
            </div>
          </div>

          {flowStep === 'audience' && (
            <section className="campaign-panel campaign-step-panel">
              <div className="campaign-step-header">
                <div>
                  <h2>Audience</h2>
                  <p>{selectedRecipientCount} recipient{selectedRecipientCount === 1 ? '' : 's'} selected</p>
                </div>
                <div className="campaign-recipient-actions">
                  <button type="button" className="action-btn secondary" onClick={selectAllFiltered}>
                    <LucideIcon name="CheckSquare" size={15} /> Select Filtered
                  </button>
                  <button type="button" className="action-btn secondary" onClick={clearRecipients} disabled={!hasRecipients && !manualRecipientText.trim()}>
                    <LucideIcon name="X" size={15} /> Clear
                  </button>
                </div>
              </div>

              <div className="workspace-toolbar compact-toolbar campaign-audience-controls">
                <label className="toolbar-search">
                  <LucideIcon name="Search" size={16} />
                  <input placeholder="Search users" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
                </label>
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  {roleOptions.map((role) => <option key={role} value={role}>{role === 'all' ? 'All roles' : role}</option>)}
                </select>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="all">All groups</option>
                  {groups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
                </select>
              </div>

              <div className="campaign-section-label">
                <span>Groups</span>
                <strong>{selectedGroups.length} selected</strong>
              </div>
              <div className="group-picker campaign-group-picker">
                {groups.map((group) => (
                  <label key={group.groupId} className="group-chip">
                    <input type="checkbox" checked={!!selectedGroupIds[group.groupId]} onChange={() => toggleGroup(group.groupId)} />
                    <span>{group.name}</span>
                    <em>{Object.values(group.members || {}).filter(Boolean).length}</em>
                  </label>
                ))}
                {groups.length === 0 && <div className="empty-state refined compact-empty"><LucideIcon name="Users" size={28} /><h2>No groups yet.</h2></div>}
              </div>

              <div className="campaign-section-label">
                <span>Manual emails</span>
                <strong>{selectedManualRecipients.length} valid</strong>
              </div>
              <div className="manual-recipient-panel">
                <label>
                  Paste or type emails
                  <textarea
                    className="input-field manual-recipient-input"
                    value={manualRecipientText}
                    onChange={(event) => setManualRecipientText(event.target.value)}
                    placeholder={'nolan@example.com\nJordan Miller <jordan@example.com>\norders@example.com'}
                    spellCheck={false}
                  />
                </label>
                <div className="manual-recipient-help">
                  <LucideIcon name="Info" size={15} />
                  <span>Use commas, spaces, or new lines. Existing selected users are deduped by email.</span>
                </div>
                {manualRecipients.length > 0 && (
                  <div className="manual-recipient-chips">
                    {manualRecipients.map((recipient) => (
                      <span className={selectedUserEmailSet.has(recipient.email) ? 'deduped' : ''} key={recipient.email}>
                        <strong>{recipient.displayName}</strong>
                        <small>{recipient.email}</small>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="campaign-section-label">
                <span>Users</span>
                <strong>{filteredUsers.length} shown</strong>
              </div>
              <div className="recipient-list campaign-audience-list">
                {filteredUsers.map((user) => (
                  <label className="recipient-row" key={user.uid}>
                    <input type="checkbox" checked={!!selectedUids[user.uid]} onChange={() => toggleUid(user.uid)} />
                    <span>
                      <strong>{userLabel(user)}</strong>
                      <small>{user.email}</small>
                    </span>
                    <em>{user.role || 'customer'}</em>
                  </label>
                ))}
                {filteredUsers.length === 0 && <div className="empty-state refined compact-empty"><LucideIcon name="Search" size={28} /><h2>No matching users.</h2></div>}
              </div>
            </section>
          )}

          {flowStep === 'message' && (
            <section className="campaign-panel campaign-step-panel">
              <div className="campaign-step-header">
                <div>
                  <h2>Message</h2>
                  <p>{messageLabel}</p>
                </div>
                {mode === 'template' && activeTemplate && (
                  <button type="button" className="action-btn secondary" onClick={copyTemplateToCustom}>
                    <LucideIcon name="Copy" size={15} /> Copy To Custom
                  </button>
                )}
              </div>

              <div className="campaign-field-grid">
                <label>
                  Campaign Name
                  <input className="input-field" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
                </label>

                <div className="campaign-mode-field">
                  <span>Send Mode</span>
                  <div className="mode-switch">
                    <button type="button" className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Template</button>
                    <button type="button" className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Custom HTML</button>
                  </div>
                </div>
              </div>

              {mode === 'template' ? (
                <>
                  <label>
                    Template
                    <select className="select-input" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                      {templates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
                    </select>
                  </label>
                  {activeTemplate && (
                    <div className="template-variable-row campaign-vars">
                      {(activeTemplate.variables || []).map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Subject
                    <input className="input-field" value={customSubject} onChange={(event) => setCustomSubject(event.target.value)} />
                  </label>
                  <label>
                    HTML
                    <textarea className="input-field code-editor campaign-html" value={customHtml} onChange={(event) => setCustomHtml(event.target.value)} spellCheck={false} />
                  </label>
                </>
              )}

              <div className="campaign-subject-strip">
                <span>Subject</span>
                <strong>{previewSubject || 'No subject'}</strong>
              </div>
            </section>
          )}

          {flowStep === 'preview' && (
            <section className="campaign-panel campaign-step-panel">
              <div className="campaign-step-header">
                <div>
                  <h2>Preview</h2>
                  <p>{selectedRecipientCount} recipient{selectedRecipientCount === 1 ? '' : 's'}</p>
                </div>
                <button type="button" className="action-btn secondary" onClick={() => setFlowStep('message')}>
                  <LucideIcon name="Pencil" size={15} /> Edit Message
                </button>
              </div>

              <div className="campaign-preview-recipients">
                {selectedPreviewUsers.map((user) => (
                  <span key={user.uid}>
                    <strong>{userLabel(user)}</strong>
                    <small>{user.email}</small>
                  </span>
                ))}
                {selectedPreviewManualRecipients.map((recipient) => (
                  <span key={recipient.email}>
                    <strong>{recipient.displayName}</strong>
                    <small>{recipient.email}</small>
                  </span>
                ))}
                {hiddenPreviewRecipientCount > 0 && <em>+{hiddenPreviewRecipientCount} more</em>}
              </div>

              <div className="template-preview campaign-preview">
                <div className="template-preview-subject">{previewSubject || 'No subject'}</div>
                <iframe title="Campaign preview" srcDoc={previewHtml || '<p>No HTML yet.</p>'} />
              </div>
            </section>
          )}

          {flowStep === 'send' && (
            <section className="campaign-panel campaign-step-panel campaign-send-step">
              <div className="campaign-step-header">
                <div>
                  <h2>Review & Send</h2>
                  <p>{hasRecipients && hasMessage ? 'Ready' : 'Needs attention'}</p>
                </div>
              </div>

              <div className="campaign-review-grid">
                <div className="campaign-review-card">
                  <span>Campaign</span>
                  <strong>{campaignName || 'Untitled campaign'}</strong>
                </div>
                <div className="campaign-review-card">
                  <span>Recipients</span>
                  <strong>{selectedRecipientCount}</strong>
                </div>
                <div className="campaign-review-card">
                  <span>Groups</span>
                  <strong>{selectedGroups.length ? selectedGroups.map((group) => group.name).join(', ') : 'None'}</strong>
                </div>
                <div className="campaign-review-card">
                  <span>Manual</span>
                  <strong>{selectedManualRecipients.length ? `${selectedManualRecipients.length} email${selectedManualRecipients.length === 1 ? '' : 's'}` : 'None'}</strong>
                </div>
                <div className="campaign-review-card">
                  <span>Message</span>
                  <strong>{messageLabel}</strong>
                </div>
                <div className="campaign-review-card span-full">
                  <span>Subject</span>
                  <strong>{previewSubject || 'No subject'}</strong>
                </div>
              </div>

              <div className="campaign-send-actions">
                {!hasRecipients && <button type="button" className="action-btn secondary" onClick={() => setFlowStep('audience')}><LucideIcon name="Users" size={15} /> Choose Audience</button>}
                {!hasMessage && <button type="button" className="action-btn secondary" onClick={() => setFlowStep('message')}><LucideIcon name="Mail" size={15} /> Finish Message</button>}
                <button type="button" className="action-btn" onClick={handleSend} disabled={!hasRecipients || !hasMessage || sending}>
                  <LucideIcon name="Send" size={16} /> {sending ? 'Sending...' : 'Send Campaign'}
                </button>
              </div>
            </section>
          )}

          <div className="campaign-flow-actions">
            <button type="button" className="action-btn secondary" onClick={previousFlowStep} disabled={flowStepIndex === 0}>
              <LucideIcon name="ChevronLeft" size={15} /> Back
            </button>
            {flowStep !== 'send' ? (
              <button type="button" className="action-btn" onClick={nextFlowStep}>
                Next <LucideIcon name="ChevronRight" size={15} />
              </button>
            ) : (
              <button type="button" className="action-btn secondary" onClick={() => setFlowStep('preview')}>
                <LucideIcon name="Eye" size={15} /> Preview Again
              </button>
            )}
          </div>
        </section>
      )}

      {activeTab === 'groups' && (
        <div className="campaign-stack">
          <form className="campaign-panel" onSubmit={saveGroup}>
            <h2>{editingGroupId ? 'Edit Group' : 'Create Group'}</h2>
            <input className="input-field" placeholder="Group name" value={groupDraft.name} onChange={(event) => setGroupDraft((prev) => ({ ...prev, name: event.target.value }))} required />
            <textarea className="input-field" placeholder="Description" value={groupDraft.description} onChange={(event) => setGroupDraft((prev) => ({ ...prev, description: event.target.value }))} />
            <div className="recipient-list group-member-list">
              {users.filter((user) => user.email && user.status !== 'blocked').map((user) => (
                <label className="recipient-row" key={user.uid}>
                  <input type="checkbox" checked={!!groupDraft.members?.[user.uid]} onChange={() => toggleGroupDraftMember(user.uid)} />
                  <span>
                    <strong>{userLabel(user)}</strong>
                    <small>{user.email}</small>
                  </span>
                  <em>{user.role || 'customer'}</em>
                </label>
              ))}
            </div>
            <div className="campaign-recipient-actions">
              <button className="action-btn" disabled={savingGroup}><LucideIcon name="Save" size={15} /> {savingGroup ? 'Saving...' : 'Save Group'}</button>
              {editingGroupId && <button type="button" className="action-btn secondary" onClick={() => { setEditingGroupId(''); setGroupDraft({ name: '', description: '', members: {} }); }}>Cancel</button>}
            </div>
          </form>

          <section className="campaign-panel">
            <h2>Saved Groups</h2>
            <div className="campaign-group-grid">
              {groups.map((group) => (
                <article className="campaign-group-card" key={group.groupId}>
                  <div>
                    <h3>{group.name}</h3>
                    <p>{group.description || 'No description.'}</p>
                    <strong>{Object.values(group.members || {}).filter(Boolean).length} members</strong>
                  </div>
                  <div className="campaign-recipient-actions">
                    <button className="action-btn secondary" onClick={() => addGroupToCampaign(group)}><LucideIcon name="Plus" size={15} /> Use Group</button>
                    <button className="action-btn secondary" onClick={() => startEditGroup(group)}><LucideIcon name="Pencil" size={15} /> Edit</button>
                    <button className="action-btn danger" onClick={() => deleteGroup(group)}><LucideIcon name="Trash2" size={15} /> Delete</button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'history' && (
        <section className="campaign-panel">
          <h2>Campaign History</h2>
          <div className="campaign-history-list">
            {campaigns.map((campaign) => (
              <article className="campaign-history-card" key={campaign.campaignId}>
                <div>
                  <span className={`status-badge status-${slugStatus(campaign.status)}`}>{campaign.status || 'unknown'}</span>
                  <h3>{campaign.campaignName || campaign.subject || 'Untitled campaign'}</h3>
                  <p>{campaign.subject}</p>
                </div>
                <div className="campaign-history-meta">
                  <div><span>Recipients</span><strong>{campaign.recipientCount || 0}</strong></div>
                  <div><span>Manual</span><strong>{campaign.manualRecipientCount || 0}</strong></div>
                  <div><span>Sent</span><strong>{campaign.successCount || 0}</strong></div>
                  <div><span>Failed</span><strong>{campaign.failureCount || 0}</strong></div>
                  <div><span>Delivered</span><strong>{campaign.eventCounts?.delivered || 0}</strong></div>
                  <div><span>Opens</span><strong>{campaign.eventCounts?.opens || 0}</strong></div>
                  <div><span>Clicks</span><strong>{campaign.eventCounts?.clicks || 0}</strong></div>
                  <div><span>Unsubs</span><strong>{campaign.eventCounts?.unsubscribes || 0}</strong></div>
                  <div><span>Date</span><strong>{formatDate(campaign.createdAt)}</strong></div>
                </div>
              </article>
            ))}
            {campaigns.length === 0 && <div className="empty-state refined"><LucideIcon name="Mail" size={36} /><h2>No campaigns yet.</h2></div>}
          </div>
        </section>
      )}
    </div>
  );
}
