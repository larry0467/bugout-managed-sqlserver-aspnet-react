import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Input, Form, Card, Typography, message, Space, Tooltip, Collapse } from 'antd';
import { PlusOutlined, CopyOutlined, SettingOutlined } from '@ant-design/icons';
import { projectApi, type Project } from '../api';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  const [webhookForm] = Form.useForm();

  const load = () => {
    setLoading(true);
    projectApi.list().then(setProjects).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    await projectApi.create(values.name);
    message.success('Project created');
    setCreateOpen(false);
    form.resetFields();
    load();
  };

  const handleWebhooks = async () => {
    if (!selectedProject) return;
    const values = await webhookForm.validateFields();
    await projectApi.updateWebhooks(selectedProject.id, values);
    message.success('Webhooks updated');
    setWebhookOpen(false);
    load();
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    message.success('API key copied');
  };

  const columns = [
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Slug', dataIndex: 'slug', key: 'slug' },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      render: (key: string) => (
        <Space>
          <Text code style={{ fontSize: 12 }}>{key.slice(0, 12)}...</Text>
          <Tooltip title="Copy API Key">
            <Button size="small" icon={<CopyOutlined />} onClick={() => copyKey(key)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: Project) => (
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            setSelectedProject(record);
            webhookForm.setFieldsValue({
              webhookUrl: record.webhookUrl || '',
              slackWebhookUrl: record.slackWebhookUrl || '',
              notificationEmail: record.notificationEmail || '',
            });
            setWebhookOpen(true);
          }}
        >
          Webhooks
        </Button>
      ),
    },
  ];

  const integrationCode = (apiKey: string) => `import { BugOutManagedWidget } from '@bugoutmanaged/widget';

function App() {
  return (
    <>
      {/* Your app content */}
      <BugOutManagedWidget
        apiKey="${apiKey}"
        apiUrl="https://bugout.managed.com/api"
        userEmail={currentUser.email}
      />
    </>
  );
}`;

  const managedIntegrationCode = (apiKey: string) => `// For managed platform apps (multi-tenant)
import { BugOutManagedWidget } from '@bugoutmanaged/widget';

function App() {
  return (
    <>
      <BugOutManagedWidget
        apiKey="${apiKey}"
        apiUrl="https://bugout.managed.com/api"
        userEmail={currentUser.email}
        tenantId={currentTenant.id}
        tenantName={currentTenant.name}
        databaseName={currentTenant.dbName}
        appVersion="1.0.0"
        environment="PRODUCTION"
      />
    </>
  );
}`;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Projects</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          New Project
        </Button>
      </div>

      <Table
        dataSource={projects}
        columns={columns}
        rowKey="id"
        loading={loading}
        expandable={{
          expandedRowRender: (record) => (
            <Card size="small" title="Integration Instructions" style={{ background: '#141414' }}>
              <Paragraph>1. Install the widget:</Paragraph>
              <Paragraph code>npm install @bugoutmanaged/widget</Paragraph>
              <Paragraph>2. Add to your React app (standard):</Paragraph>
              <pre style={{
                background: '#0d1117',
                padding: 16,
                borderRadius: 8,
                fontSize: 13,
                overflow: 'auto',
              }}>
                {integrationCode(record.apiKey)}
              </pre>
              <Paragraph style={{ marginTop: 16 }}>For multi-tenant platform apps (with tenant/database context):</Paragraph>
              <pre style={{
                background: '#0d1117',
                padding: 16,
                borderRadius: 8,
                fontSize: 13,
                overflow: 'auto',
              }}>
                {managedIntegrationCode(record.apiKey)}
              </pre>
              <Paragraph style={{ marginTop: 12 }}>3. The floating orb will appear in your app.</Paragraph>
            </Card>
          ),
        }}
      />

      {/* Create Project Modal */}
      <Modal
        title="Create Project"
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Project Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="My Application" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Webhooks Modal */}
      <Modal
        title={`Configure Webhooks - ${selectedProject?.name}`}
        open={webhookOpen}
        onOk={handleWebhooks}
        onCancel={() => setWebhookOpen(false)}
      >
        <Form form={webhookForm} layout="vertical">
          <Form.Item name="notificationEmail" label="Notification Email">
            <Input placeholder="team@example.com" />
          </Form.Item>
          <Form.Item name="slackWebhookUrl" label="Slack Webhook URL">
            <Input placeholder="https://hooks.slack.com/services/..." />
          </Form.Item>
          <Form.Item name="webhookUrl" label="Custom Webhook URL">
            <Input placeholder="https://your-app.com/webhook" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
