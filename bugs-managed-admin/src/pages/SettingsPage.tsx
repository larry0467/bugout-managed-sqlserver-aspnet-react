import React, { useEffect, useState } from 'react';
import { Card, Typography, Space, Switch, Form, Alert, Input, Button, Select, message, Divider, Tag, Steps, Table, Popconfirm, ColorPicker, Checkbox, Modal } from 'antd';
import { BellOutlined, SkinOutlined, KeyOutlined, SlackOutlined, CheckCircleOutlined, LinkOutlined, GoogleOutlined, OrderedListOutlined, DeleteOutlined, PlusOutlined, RobotOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import { projectApi, statusApi, serviceKeyApi, serviceKeyScopes, fixApi, type Project, type TicketStatusDef, type ServiceKey, type CreatedServiceKey, type AuthUser, type AppFixSetting } from '../api';

const { Title, Text, Paragraph } = Typography;

// Service keys are org-admin territory. The page has no user prop, so read
// the role App stored at login.
const currentRole = (): string | null => {
  try {
    const raw = localStorage.getItem('bom_user');
    return raw ? (JSON.parse(raw) as AuthUser).role : null;
  } catch {
    return null;
  }
};

const SettingsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [slackForm] = Form.useForm();
  const [gchatForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [gchatSaving, setGchatSaving] = useState(false);

  const [statuses, setStatuses] = useState<TicketStatusDef[]>([]);
  const [newStatusKey, setNewStatusKey] = useState('');
  const [newStatusLabel, setNewStatusLabel] = useState('');
  const [newStatusColor, setNewStatusColor] = useState('#888888');
  const [newStatusClosed, setNewStatusClosed] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const loadStatuses = () => statusApi.list().then(setStatuses).catch(() => {});
  useEffect(() => { loadStatuses(); }, []);

  // ----- service keys (machine credentials for Claude Code sessions) -----
  const isOrgAdmin = currentRole() === 'PLATFORM_OWNER' || currentRole() === 'SUPER_ADMIN';
  const [serviceKeys, setServiceKeys] = useState<ServiceKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['development:write']);
  const [keySaving, setKeySaving] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedServiceKey | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);

  const loadServiceKeys = () => serviceKeyApi.list().then(setServiceKeys).catch(() => {});
  useEffect(() => { if (isOrgAdmin) loadServiceKeys(); }, [isOrgAdmin]);

  // ----- auto-draft fixes per app (Claude Code on the devbox) -----
  const [fixApps, setFixApps] = useState<AppFixSetting[]>([]);
  const loadFixApps = () => fixApi.apps().then(setFixApps).catch(() => {});
  useEffect(() => { if (isOrgAdmin) loadFixApps(); }, [isOrgAdmin]);

  const toggleAutoDraft = async (app: AppFixSetting, enabled: boolean) => {
    try {
      await fixApi.setAutoDraft(app.id, enabled);
      await loadFixApps();
      message.success(enabled ? `Auto-draft fixes on for ${app.name}` : `Auto-draft fixes off for ${app.name}`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Could not change the setting');
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setKeySaving(true);
    try {
      const created = await serviceKeyApi.create(newKeyName.trim(), newKeyScopes);
      setCreatedKey(created);
      setNewKeyName('');
      await loadServiceKeys();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to create the service key');
    } finally {
      setKeySaving(false);
    }
  };

  const handleRevokeKey = async (id: number) => {
    try {
      await serviceKeyApi.revoke(id);
      await loadServiceKeys();
      message.success('Service key revoked');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to revoke');
    }
  };

  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '') || window.location.origin;
  const keyFileJson = createdKey
    ? JSON.stringify({ key: createdKey.key, apiBase, org: localStorage.getItem('bom_org') ? JSON.parse(localStorage.getItem('bom_org')!).slug : undefined }, null, 2)
    : '';

  // A page cannot write to a chosen folder (browser sandbox), but it can hand
  // the file to the browser's Downloads folder with the right name.
  const downloadKeyFile = () => {
    if (!keyFileJson) return;
    const blob = new Blob([keyFileJson + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'service-key.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    message.success('service-key.json downloaded — move it to %USERPROFILE%\\.bugout\\ on the devbox');
  };

  useEffect(() => {
    projectApi.list().then((data) => {
      setProjects(data);
      if (data.length > 0) setSelectedProject(data[0]);
    });
  }, []);

  useEffect(() => {
    if (selectedProject) {
      slackForm.setFieldsValue({
        slackWebhookUrl: selectedProject.slackWebhookUrl || '',
        slackChannel: selectedProject.slackChannel || '',
        slackBotToken: selectedProject.slackBotToken || '',
      });
      gchatForm.setFieldsValue({
        googleChatWebhookUrl: selectedProject.googleChatWebhookUrl || '',
      });
    }
  }, [selectedProject, slackForm, gchatForm]);

  const handleSaveGoogleChat = async () => {
    if (!selectedProject) return;
    setGchatSaving(true);
    try {
      const values = await gchatForm.validateFields();
      const updated = await projectApi.updateWebhooks(selectedProject.id, {
        googleChatWebhookUrl: values.googleChatWebhookUrl || '',
      });
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedProject(updated);
      message.success('Google Chat webhook saved');
    } catch {
      message.error('Failed to save Google Chat webhook');
    } finally {
      setGchatSaving(false);
    }
  };

  const handleAddStatus = async () => {
    if (!newStatusKey.trim() || !newStatusLabel.trim()) return;
    setStatusSaving(true);
    try {
      await statusApi.create({
        key: newStatusKey.trim(),
        displayName: newStatusLabel.trim(),
        color: newStatusColor,
        isClosedLike: newStatusClosed,
      });
      setNewStatusKey(''); setNewStatusLabel(''); setNewStatusColor('#888888'); setNewStatusClosed(false);
      await loadStatuses();
      message.success('Status added');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to add status');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleUpdateStatus = async (id: number, data: Partial<TicketStatusDef>) => {
    try {
      await statusApi.update(id, {
        displayName: data.displayName,
        color: data.color,
        isClosedLike: data.isClosedLike,
        sortOrder: data.sortOrder,
      });
      await loadStatuses();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to update');
    }
  };

  const handleRemoveStatus = async (id: number) => {
    try {
      await statusApi.remove(id);
      await loadStatuses();
      message.success('Status removed');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to remove');
    }
  };

  const moveStatus = async (id: number, direction: -1 | 1) => {
    const sorted = [...statuses].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      statusApi.update(a.id, { sortOrder: b.sortOrder }),
      statusApi.update(b.id, { sortOrder: a.sortOrder }),
    ]);
    await loadStatuses();
  };

  const handleSaveSlack = async () => {
    if (!selectedProject) return;
    setSaving(true);
    try {
      const values = await slackForm.validateFields();
      const updated = await projectApi.updateSlack(selectedProject.id, values);
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      setSelectedProject(updated);
      message.success('Slack configuration saved');
    } catch (err: any) {
      message.error('Failed to save Slack configuration');
    } finally {
      setSaving(false);
    }
  };

  const slackConnected = selectedProject?.slackWebhookUrl && selectedProject.slackWebhookUrl.length > 0;
  const gchatConnected = selectedProject?.googleChatWebhookUrl && selectedProject.googleChatWebhookUrl.length > 0;

  return (
    <div>
      <Title level={3}>Settings</Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>

        {/* Slack Integration */}
        <Card
          title={
            <Space>
              <SlackOutlined style={{ color: '#4A154B' }} />
              <span>Slack Integration</span>
              {slackConnected && <Tag color="success" icon={<CheckCircleOutlined />}>Connected</Tag>}
            </Space>
          }
        >
          <div style={{ marginBottom: 16 }}>
            <Select
              value={selectedProject?.id}
              onChange={(val) => setSelectedProject(projects.find(p => p.id === val) || null)}
              style={{ width: 280 }}
              placeholder="Select application"
              options={projects.map((p) => ({ label: p.name, value: p.id }))}
            />
          </div>

          <Form form={slackForm} layout="vertical">
            <Form.Item
              name="slackWebhookUrl"
              label="Slack Incoming Webhook URL"
              extra="Messages from ticket chat will be posted here. Create one at api.slack.com/apps > Incoming Webhooks."
            >
              <Input placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXX" />
            </Form.Item>

            <Form.Item
              name="slackChannel"
              label="Slack Channel"
              extra="The channel name where bug reports appear (e.g., #bugout-financials-managed)."
            >
              <Input placeholder="#bugout-reports" />
            </Form.Item>

            <Form.Item
              name="slackBotToken"
              label="Slack Bot Token (optional)"
              extra="Required for inbound messages from Slack. Create a Slack App with chat:write and channels:history scopes."
            >
              <Input.Password placeholder="xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx" />
            </Form.Item>

            <Button type="primary" onClick={handleSaveSlack} loading={saving}>
              Save Slack Configuration
            </Button>
          </Form>

          <Divider />

          <div>
            <Text strong>Inbound Slack Setup (receive messages from Slack into ticket chat)</Text>
            <div style={{ marginTop: 12, background: '#0d1117', padding: 16, borderRadius: 8 }}>
              <Steps
                direction="vertical"
                size="small"
                current={-1}
                items={[
                  {
                    title: 'Create a Slack App',
                    description: 'Go to api.slack.com/apps and create a new app for your workspace.',
                  },
                  {
                    title: 'Add a Slash Command',
                    description: (
                      <div>
                        <Text type="secondary">Command:</Text> <Text code>/bugout-chat</Text><br />
                        <Text type="secondary">Request URL:</Text> <Text code>https://your-domain.com/api/slack/command</Text><br />
                        <Text type="secondary">Usage:</Text> <Text code>/bugout-chat 42 Looking into this now</Text>
                      </div>
                    ),
                  },
                  {
                    title: 'Enable Events API (optional)',
                    description: (
                      <div>
                        <Text type="secondary">Request URL:</Text> <Text code>https://your-domain.com/api/slack/events</Text><br />
                        <Text type="secondary">Subscribe to:</Text> <Text code>message.channels</Text><br />
                        <Text type="secondary">Format:</Text> Start message with <Text code>#42</Text> or <Text code>ticket:42</Text> to route to a ticket.
                      </div>
                    ),
                  },
                  {
                    title: 'Install the app to your workspace',
                    description: 'OAuth & Permissions > Install to Workspace. Copy the Bot Token above.',
                  },
                ]}
              />
            </div>
          </div>
        </Card>

        {/* Google Chat Integration */}
        <Card
          title={
            <Space>
              <GoogleOutlined style={{ color: '#1a73e8' }} />
              <span>Google Chat Integration</span>
              {gchatConnected && <Tag color="success" icon={<CheckCircleOutlined />}>Connected</Tag>}
            </Space>
          }
        >
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Posts @-mention notifications (and future ticket events) into a Google Chat space via an incoming webhook.
            In your Chat space, click the space name → <Text code>Apps & integrations</Text> → <Text code>Add webhooks</Text> →
            name it "Bug Out Managed" → copy the URL it generates.
          </Paragraph>
          <Form form={gchatForm} layout="vertical">
            <Form.Item
              name="googleChatWebhookUrl"
              label="Google Chat Incoming Webhook URL"
              extra="Looks like https://chat.googleapis.com/v1/spaces/AAAA.../messages?key=...&token=..."
            >
              <Input placeholder="https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..." />
            </Form.Item>
            <Button type="primary" onClick={handleSaveGoogleChat} loading={gchatSaving}>
              Save Google Chat Configuration
            </Button>
          </Form>
        </Card>

        {/* Ticket Statuses */}
        <Card title={<><OrderedListOutlined /> Ticket Statuses</>}>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            These are the status values tickets can move through. They drive the Status dropdown and the columns on the Board view.
            <Text strong> "Closed-like"</Text> statuses are treated as terminal — hidden by the "Show closed" toggle on the Tickets page.
            You can't delete a status that's currently in use; move those tickets first.
          </Paragraph>

          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={[...statuses].sort((a, b) => a.sortOrder - b.sortOrder)}
            columns={[
              {
                title: 'Order',
                key: 'order',
                width: 90,
                render: (_, record, idx) => (
                  <Space size={2}>
                    <Button size="small" disabled={idx === 0} onClick={() => moveStatus(record.id, -1)}>↑</Button>
                    <Button size="small" disabled={idx === statuses.length - 1} onClick={() => moveStatus(record.id, 1)}>↓</Button>
                  </Space>
                ),
              },
              {
                title: 'Key',
                dataIndex: 'key',
                width: 200,
                render: (v: string) => <Text code>{v}</Text>,
              },
              {
                title: 'Display name',
                dataIndex: 'displayName',
                render: (v: string, record: TicketStatusDef) => (
                  <Input
                    size="small"
                    defaultValue={v}
                    onBlur={(e) => {
                      if (e.target.value && e.target.value !== v) {
                        handleUpdateStatus(record.id, { displayName: e.target.value });
                      }
                    }}
                  />
                ),
              },
              {
                title: 'Color',
                dataIndex: 'color',
                width: 130,
                render: (v: string, record: TicketStatusDef) => (
                  <ColorPicker
                    value={v}
                    onChangeComplete={(c) => handleUpdateStatus(record.id, { color: c.toHexString() })}
                    showText
                  />
                ),
              },
              {
                title: 'Closed-like',
                dataIndex: 'isClosedLike',
                width: 110,
                render: (v: boolean, record: TicketStatusDef) => (
                  <Switch checked={v} onChange={(checked) => handleUpdateStatus(record.id, { isClosedLike: checked })} />
                ),
              },
              {
                title: '',
                width: 60,
                render: (_, record: TicketStatusDef) => (
                  <Popconfirm title={`Delete status "${record.displayName}"?`} onConfirm={() => handleRemoveStatus(record.id)}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                ),
              },
            ]}
          />

          <Divider />

          <div>
            <Text strong>Add a new status</Text>
            <Space wrap style={{ marginTop: 8 }}>
              <Input
                placeholder="KEY (e.g. WONT_FIX)"
                value={newStatusKey}
                onChange={(e) => setNewStatusKey(e.target.value.toUpperCase().replace(/ /g, '_'))}
                style={{ width: 200 }}
              />
              <Input
                placeholder="Display name"
                value={newStatusLabel}
                onChange={(e) => setNewStatusLabel(e.target.value)}
                style={{ width: 200 }}
              />
              <ColorPicker
                value={newStatusColor}
                onChangeComplete={(c) => setNewStatusColor(c.toHexString())}
                showText
              />
              <Space>
                <Text type="secondary">Closed-like</Text>
                <Switch checked={newStatusClosed} onChange={setNewStatusClosed} />
              </Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddStatus}
                loading={statusSaving}
                disabled={!newStatusKey.trim() || !newStatusLabel.trim()}
              >
                Add
              </Button>
            </Space>
          </div>
        </Card>

        {/* Auto-draft fixes — which apps hand incoming bugs to Claude Code on the devbox */}
        {isOrgAdmin && (
          <Card title={<><RobotOutlined /> Auto-draft Fixes (Claude Code on the devbox)</>}>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              When on for an app, every <Text strong>bug</Text> reported through its widget is queued for a drafted fix.
              The dispatcher on the devbox picks it up, runs Claude Code against the app's repos with the recording's
              transcript and console errors, opens pull requests against <Text code>dev</Text>, and marks the ticket{' '}
              <Text strong>Fix ready to test</Text>. Nothing is merged or published by it: approve or reject the fix on the
              ticket, then the team merges and beta picks it up. Any ticket can also be queued by hand with{' '}
              <Text strong>Request Claude fix</Text>. If the devbox is off, requests simply wait.
            </Paragraph>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={fixApps}
              locale={{ emptyText: 'No applications yet' }}
              columns={[
                { title: 'Application', dataIndex: 'name' },
                {
                  title: 'Auto-draft fixes',
                  dataIndex: 'autoDraftFixes',
                  width: 150,
                  render: (v: boolean, app: AppFixSetting) => <Switch checked={v} onChange={(checked) => toggleAutoDraft(app, checked)} />,
                },
                { title: 'Queued', dataIndex: 'requested', width: 90, render: (v: number) => (v ? <Tag color="gold">{v}</Tag> : <Text type="secondary">0</Text>) },
                { title: 'In progress', dataIndex: 'claimed', width: 110, render: (v: number) => (v ? <Tag color="blue">{v}</Tag> : <Text type="secondary">0</Text>) },
                { title: 'Ready to test', dataIndex: 'readyToTest', width: 120, render: (v: number) => (v ? <Tag color="purple">{v}</Tag> : <Text type="secondary">0</Text>) },
              ]}
            />
          </Card>
        )}

        {/* Service keys — machine credentials for the development tracker */}
        {isOrgAdmin && (
          <Card title={<><RobotOutlined /> Service Keys (Claude Code sessions)</>}>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              A service key lets a non-interactive caller (a Claude Code session on the devbox) log development orders, add
              PR links and move stages on the <Text strong>Development</Text> board. It is sent as the{' '}
              <Text code>X-BOM-Service-Key</Text> header and is accepted <Text strong>only</Text> on{' '}
              <Text code>/api/development/*</Text>: it cannot read bug reports, manage users or create other keys.
              The key is shown once; only its hash is stored. Revoke and re-issue if it leaks.
            </Paragraph>
            <Paragraph type="secondary" style={{ marginBottom: 12 }}>
              The same kind of key authenticates the <Text strong>Azure DevOps</Text> service hooks (use a separate key named for
              them). In Azure DevOps project settings, add Web Hooks for <Text italic>pull request created</Text>,{' '}
              <Text italic>pull request updated</Text> and <Text italic>release deployment completed</Text> (or{' '}
              <Text italic>run stage state changed</Text>) pointing at{' '}
              <Text code>{apiBase}/api/development/webhooks/azure-devops</Text> with the HTTP header{' '}
              <Text code>X-BOM-Service-Key</Text>. PRs then appear on the Development board, merges move items to
              Merged to dev, and beta / production deployments move them on.
            </Paragraph>

            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={serviceKeys.filter((k) => showRevoked || !k.revokedAt)}
              locale={{ emptyText: 'No service keys yet' }}
              columns={[
                { title: 'Name', dataIndex: 'name' },
                { title: 'Key', dataIndex: 'keyPrefix', render: (v: string) => <Text code>{v}…</Text> },
                { title: 'Scopes', dataIndex: 'scopes', render: (v: string[]) => v.map((s) => <Tag key={s}>{s}</Tag>) },
                { title: 'Created', dataIndex: 'createdAt', render: (v: string, r: ServiceKey) => <>{new Date(v).toLocaleDateString()} <Text type="secondary">{r.createdBy}</Text></> },
                { title: 'Last used', dataIndex: 'lastUsedAt', render: (v?: string | null) => (v ? new Date(v).toLocaleString() : <Text type="secondary">never</Text>) },
                {
                  title: 'Status',
                  key: 'status',
                  render: (_: any, r: ServiceKey) => r.revokedAt
                    ? <Tag color="default">revoked {new Date(r.revokedAt).toLocaleDateString()}</Tag>
                    : <Tag color="success" icon={<CheckCircleOutlined />}>active</Tag>,
                },
                {
                  title: '',
                  key: 'actions',
                  width: 60,
                  render: (_: any, r: ServiceKey) => !r.revokedAt && (
                    <Popconfirm title={`Revoke "${r.name}"? Sessions using it stop working immediately.`} onConfirm={() => handleRevokeKey(r.id)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 8 }}>
              <Checkbox checked={showRevoked} onChange={(e) => setShowRevoked(e.target.checked)}>Show revoked keys</Checkbox>
            </div>

            <Divider />

            <Text strong>Create a key</Text>
            <Space wrap style={{ marginTop: 8 }}>
              <Input
                placeholder="Name (e.g. Claude Code - devbox)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                style={{ width: 280 }}
                maxLength={100}
              />
              <Checkbox.Group
                value={newKeyScopes}
                onChange={(v) => setNewKeyScopes(v as string[])}
                options={serviceKeyScopes.map((s) => ({ label: s, value: s }))}
              />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateKey} loading={keySaving} disabled={!newKeyName.trim() || newKeyScopes.length === 0}>
                Create
              </Button>
            </Space>

            <Modal
              title="Service key created — copy it now"
              open={!!createdKey}
              onCancel={() => setCreatedKey(null)}
              onOk={() => setCreatedKey(null)}
              okText="I saved it"
              cancelButtonProps={{ style: { display: 'none' } }}
              width={720}
            >
              {createdKey && (
                <div>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="This is the only time the key is shown."
                    description={`Name: ${createdKey.name} · scopes: ${createdKey.scopes.join(', ')} · header: ${createdKey.header} · accepted on ${createdKey.acceptedOn}`}
                  />
                  <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
                    <Input readOnly value={createdKey.key} style={{ fontFamily: 'monospace' }} />
                    <Button icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(createdKey.key); message.success('Key copied'); }}>Copy</Button>
                  </Space.Compact>
                  <Paragraph type="secondary" style={{ marginBottom: 4 }}>
                    On the devbox, save it as <Text code>%USERPROFILE%\.bugout\service-key.json</Text> (never commit it):
                  </Paragraph>
                  <pre style={{ background: '#0d1117', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto' }}>{keyFileJson}</pre>
                  <Space>
                    <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={downloadKeyFile}>
                      Download service-key.json
                    </Button>
                    <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(keyFileJson); message.success('JSON copied'); }}>
                      Copy JSON
                    </Button>
                  </Space>
                  <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
                    The download goes to this browser's Downloads folder; the sessions read it from the devbox, so move it
                    there if you are browsing from another machine.
                  </Paragraph>
                </div>
              )}
            </Modal>
          </Card>
        )}

        {/* Notification Preferences */}
        <Card title={<><BellOutlined /> Notification Preferences</>}>
          <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
            <Form.Item label="Email notifications for new tickets">
              <Switch defaultChecked />
            </Form.Item>
            <Form.Item label="Email notifications for critical tickets">
              <Switch defaultChecked />
            </Form.Item>
            <Form.Item label="Slack notifications for escalations">
              <Switch defaultChecked />
            </Form.Item>
            <Form.Item label="Webhook on ticket status change">
              <Switch />
            </Form.Item>
          </Form>
        </Card>

        <Card title={<><SkinOutlined /> Custom Branding</>}>
          <Alert
            message="Coming Soon"
            description="Custom branding options including logo upload, color themes, and white-label widget will be available in a future release."
            type="info"
            showIcon
          />
        </Card>

        <Card title={<><KeyOutlined /> API Key Management</>}>
          <Paragraph>
            API keys are managed per-project. Visit the Applications page to view, copy, or rotate API keys for each project.
          </Paragraph>
          <Alert
            message="API Key Rotation"
            description="Key rotation will invalidate the current key immediately. Make sure to update all widget installations with the new key."
            type="warning"
            showIcon
          />
        </Card>
      </Space>
    </div>
  );
};

export default SettingsPage;
