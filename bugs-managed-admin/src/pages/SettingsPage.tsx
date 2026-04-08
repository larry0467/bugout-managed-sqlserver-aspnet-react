import React, { useEffect, useState } from 'react';
import { Card, Typography, Space, Switch, Form, Alert, Input, Button, Select, message, Divider, Tag, Steps } from 'antd';
import { BellOutlined, SkinOutlined, KeyOutlined, SlackOutlined, CheckCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { projectApi, type Project } from '../api';

const { Title, Text, Paragraph } = Typography;

const SettingsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [slackForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

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
    }
  }, [selectedProject, slackForm]);

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
              extra="The channel name where bug reports appear (e.g., #bugs-financials-managed)."
            >
              <Input placeholder="#bugs-reports" />
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
                        <Text type="secondary">Command:</Text> <Text code>/bug-chat</Text><br />
                        <Text type="secondary">Request URL:</Text> <Text code>https://your-domain.com/api/slack/command</Text><br />
                        <Text type="secondary">Usage:</Text> <Text code>/bug-chat 42 Looking into this now</Text>
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
