import React, { useEffect, useMemo, useState } from 'react';
import { ref, onValue, push, remove, serverTimestamp, set } from 'firebase/database';
import { db } from '../firebase';
import { getEmailTemplateCatalog, sendEmailCampaign } from '../../services/adminService';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import LucideIcon from '../../components/ui/LucideIcon';
import '../BusinessDashboard.css';

const roleOptions = ['all', 'customer', 'business', 'admin'];

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

export default function EmailCampaigns() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [activeTab, setActiveTab] = useState('compose');
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
      return matchesSearch && matchesRole && matchesGroup && user.email && user.status !== 'blocked';
    });
  }, [users, searchTerm, roleFilter, groupFilter, groupById]);

  const selectedRecipientUids = useMemo(() => {
    const ids = new Set(Object.keys(selectedUids).filter((uid) => selectedUids[uid]));
    Object.keys(selectedGroupIds).filter((id) => selectedGroupIds[id]).forEach((groupId) => {
      Object.keys(groupById[groupId]?.members || {}).forEach((uid) => ids.add(uid));
    });
    return [...ids].filter((uid) => userById[uid]?.email && userById[uid]?.status !== 'blocked');
  }, [selectedUids, selectedGroupIds, groupById, userById]);

  const selectedGroups = Object.keys(selectedGroupIds).filter((id) => selectedGroupIds[id]).map((id) => groupById[id]).filter(Boolean);
  const previewSubject = mode === 'template' ? activeTemplate?.effectiveSubject || activeTemplate?.subject || '' : customSubject;
  const previewHtml = mode === 'template' ? activeTemplate?.effectiveHtml || activeTemplate?.html || '<p>No template selected.</p>' : customHtml;

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
      recipientUids: Object.keys(selectedUids).filter((uid) => selectedUids[uid]),
      groupIds: Object.keys(selectedGroupIds).filter((groupId) => selectedGroupIds[groupId]),
      mode,
      templateId,
      subject: customSubject,
      html: customHtml
    };

    if (selectedRecipientUids.length === 0) {
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
      `Send "${campaignName || 'this campaign'}" to ${selectedRecipientUids.length} recipient${selectedRecipientUids.length === 1 ? '' : 's'}?`,
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

  if (loading) return <div className="business-workspace"><div className="loading-shimmer">Loading email campaigns...</div></div>;

  return (
    <div className="business-workspace email-campaign-page">
      <div className="workspace-hero">
        <div>
          <p className="workspace-eyebrow">Email</p>
          <h1>Campaigns</h1>
          <p>Select customers, groups, or individual users, then send a reusable template or pasted HTML email.</p>
        </div>
        <button className="action-btn workspace-primary-action" onClick={handleSend} disabled={sending}>
          <LucideIcon name="Send" size={16} /> {sending ? 'Sending...' : 'Send Campaign'}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats">
        <div className="stat-card compact"><span>Recipients</span><strong>{selectedRecipientUids.length}</strong></div>
        <div className="stat-card compact"><span>Groups</span><strong>{selectedGroups.length}</strong></div>
        <div className="stat-card compact"><span>Templates</span><strong>{templates.length}</strong></div>
        <div className="stat-card compact"><span>Campaigns</span><strong>{campaigns.length}</strong></div>
      </div>

      <div className="editor-tabs business-tabs">
        <button className={activeTab === 'compose' ? 'active' : ''} onClick={() => setActiveTab('compose')}>Compose</button>
        <button className={activeTab === 'groups' ? 'active' : ''} onClick={() => setActiveTab('groups')}>Groups</button>
        <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>History</button>
      </div>

      {activeTab === 'compose' && (
        <div className="campaign-compose-grid">
          <section className="campaign-panel">
            <h2>Recipients</h2>
            <div className="workspace-toolbar compact-toolbar">
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

            <div className="campaign-recipient-actions">
              <button className="action-btn secondary" onClick={selectAllFiltered}><LucideIcon name="CheckSquare" size={15} /> Select Filtered</button>
              <button className="action-btn secondary" onClick={clearRecipients}><LucideIcon name="X" size={15} /> Clear</button>
            </div>

            <div className="group-picker">
              {groups.map((group) => (
                <label key={group.groupId} className="group-chip">
                  <input type="checkbox" checked={!!selectedGroupIds[group.groupId]} onChange={() => toggleGroup(group.groupId)} />
                  <span>{group.name}</span>
                  <em>{Object.values(group.members || {}).filter(Boolean).length}</em>
                </label>
              ))}
            </div>

            <div className="recipient-list">
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
            </div>
          </section>

          <section className="campaign-panel">
            <h2>Message</h2>
            <label>
              Campaign Name
              <input className="input-field" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} />
            </label>

            <div className="mode-switch">
              <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Use Template</button>
              <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Paste Custom HTML</button>
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
                <button className="action-btn secondary" onClick={copyTemplateToCustom}>
                  <LucideIcon name="Copy" size={15} /> Copy Template To Custom
                </button>
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

            <div className="template-preview campaign-preview">
              <div className="template-preview-subject">{previewSubject || 'No subject'}</div>
              <iframe title="Campaign preview" srcDoc={previewHtml || '<p>No HTML yet.</p>'} />
            </div>
          </section>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="campaign-compose-grid">
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
                  <div><span>Sent</span><strong>{campaign.successCount || 0}</strong></div>
                  <div><span>Failed</span><strong>{campaign.failureCount || 0}</strong></div>
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
