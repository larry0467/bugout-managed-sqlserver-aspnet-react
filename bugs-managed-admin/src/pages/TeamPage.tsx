import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Typography, message, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, CrownOutlined, UserOutlined, EyeOutlined } from '@ant-design/icons';
import { teamApi, type TeamMember } from '../api';

const { Title } = Typography;

const roleColors: Record<string, string> = {
  PLATFORM_ADMIN: 'gold',
  PROJECT_ADMIN: 'blue',
  VIEWER: 'default',
};

const roleIcons: Record<string, React.ReactNode> = {
  PLATFORM_ADMIN: <CrownOutlined />,
  PROJECT_ADMIN: <UserOutlined />,
  VIEWER: <EyeOutlined />,
};

const roleLabels: Record<string, string> = {
  PLATFORM_ADMIN: 'Platform Admin',
  PROJECT_ADMIN: 'Project Admin',
  VIEWER: 'Viewer',
};

const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [form] = Form.useForm();

  const currentUser = JSON.parse(localStorage.getItem('bm_user') || '{}');

  const load = () => {
    setLoading(true);
    teamApi.list().then(setMembers).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    setInviteLoading(true);
    try {
      const values = await form.validateFields();
      await teamApi.invite(values);
      message.success(`${values.fullName} has been added to the team`);
      setInviteOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to invite member');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: number, role: string) => {
    try {
      await teamApi.updateRole(userId, role);
      message.success('Role updated');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleRemove = async (userId: number) => {
    try {
      await teamApi.remove(userId);
      message.success('Member removed');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const columns = [
    {
      title: 'Name',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (name: string, record: TeamMember) => (
        <Space>
          <span>{name}</span>
          {record.email === currentUser.email && <Tag color="green">You</Tag>}
        </Space>
      ),
    },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      width: 200,
      render: (role: string, record: TeamMember) => {
        if (record.email === currentUser.email) {
          return <Tag icon={roleIcons[role]} color={roleColors[role]}>{roleLabels[role]}</Tag>;
        }
        return (
          <Select
            value={role}
            size="small"
            style={{ width: 170 }}
            onChange={(val) => handleRoleChange(record.id, val)}
            options={[
              { label: 'Platform Admin', value: 'PLATFORM_ADMIN' },
              { label: 'Project Admin', value: 'PROJECT_ADMIN' },
              { label: 'Viewer', value: 'VIEWER' },
            ]}
          />
        );
      },
    },
    {
      title: 'Joined',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: any, record: TeamMember) => {
        if (record.email === currentUser.email) return null;
        return (
          <Popconfirm
            title="Remove team member?"
            description={`This will remove ${record.fullName} from the organization.`}
            onConfirm={() => handleRemove(record.id)}
            okText="Remove"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              Remove
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Team</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
          Add Team Member
        </Button>
      </div>

      <Table
        dataSource={members}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
      />

      <Modal
        title="Add Team Member"
        open={inviteOpen}
        onOk={handleInvite}
        onCancel={() => { setInviteOpen(false); form.resetFields(); }}
        okText="Add Member"
        confirmLoading={inviteLoading}
      >
        <Form form={form} layout="vertical" initialValues={{ role: 'PROJECT_ADMIN' }}>
          <Form.Item name="fullName" label="Full Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="John Smith" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Valid email is required' }]}>
            <Input placeholder="john@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Temporary Password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}
            extra="The team member can change this after first login.">
            <Input.Password placeholder="Temporary password" />
          </Form.Item>
          <Form.Item name="role" label="Role">
            <Select options={[
              { label: 'Platform Admin — Full access, can manage team & all projects', value: 'PLATFORM_ADMIN' },
              { label: 'Project Admin — Can manage tickets & projects in the org', value: 'PROJECT_ADMIN' },
              { label: 'Viewer — Read-only access to tickets & dashboards', value: 'VIEWER' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TeamPage;
