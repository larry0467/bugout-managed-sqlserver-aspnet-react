import React, { useEffect, useState } from 'react';
import { Card, Typography, Space, Switch, Form, Alert, Input, Button, Select, message, Divider, Tag, Steps, Table, Popconfirm, ColorPicker } from 'antd';
import { BellOutlined, SkinOutlined, KeyOutlined, SlackOutlined, CheckCircleOutlined, LinkOutlined, GoogleOutlined, OrderedListOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { projectApi, statusApi, type Project, type TicketStatusDef } from '../api';

const { Title, Text, Paragraph } = Typography;

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
