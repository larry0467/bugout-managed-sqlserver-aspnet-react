import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Tag, Typography, message, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, CrownOutlined, UserOutlined, EyeOutlined, CodeOutlined } from '@ant-design/icons';
import { teamApi, projectApi, type TeamMember, type Project } from '../api';

const { Title } = Typography;

const roleColors: Record<string, string> = {
  PLATFORM_OWNER: 'gold',
  SUPER_ADMIN: 'blue',
  DEVELOPER: 'purple',
  VIEWER: 'default',
};

const roleIcons: Record<string, React.ReactNode> = {
  PLATFORM_OWNER: <CrownOutlined />,
  SUPER_ADMIN: <UserOutlined />,
  DEVELOPER: <CodeOutlined />,
  VIEWER: <EyeOutlined />,
};

const roleLabels: Record<string, string> = {
  PLATFORM_OWNER: 'Platform Owner',
  SUPER_ADMIN: 'Super Admin',
  DEVELOPER: 'Developer',
  VIEWER: 'Viewer',
};


const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [form] = Form.useForm();
  const [projects, setProjects] = useState<Project[]>([]);
  // Track which user's project select is open / being saved
  const [projectsSaving, setProjectsSaving] = useState<Record<number, boolean>>({});

  const currentUser = JSON.parse(localStorage.getItem('bom_user') || '{}');

  const load = () => {
    setLoading(true);
    teamApi.list().then(setMembers).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    projectApi.list().then(setProjects).catch(() => {});
  }, []);

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

  const handleRoleChange = async (userId: number, role: string, specialty?: string) => {
    try {
      await teamApi.updateRole(userId, role, specialty);
      message.success('Role updated');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleSpecialtyChange = async (member: TeamMember, specialty: string) => {
    try {
      await teamApi.updateRole(member.id, member.role, specialty);
      message.success('Specialty updated');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update specialty');
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

  const handleProjectAssignments = async (userId: number, selected: (number | 'all')[]) => {
    // If 'all' is the last item added, clear all specific IDs
    const allSelected = selected.includes('all' as any);
    const projectIds = allSelected ? [] : (selected as number[]);
    setProjectsSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      await teamApi.setUserProjects(userId, projectIds);
      message.success('Project assignments updated');
      load();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Failed to update project assignments');
    } finally {
      setProjectsSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.name]));

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
      width: 180,
      render: (role: string, record: TeamMember) => {
        if (record.email === currentUser.email) {
          return <Tag icon={roleIcons[role]} color={roleColors[role]}>{roleLabels[role]}</Tag>;
        }
        return (
          <Select
            value={role}
            size="small"
            style={{ width: 160 }}
            onChange={(val) => handleRoleChange(record.id, val, record.specialty)}
            options={[
              { label: 'Platform Owner', value: 'PLATFORM_OWNER' },
              { label: 'Super Admin', value: 'SUPER_ADMIN' },
              { label: 'Developer', value: 'DEVELOPER' },
              { label: 'Viewer', value: 'VIEWER' },
            ]}
          />
        );
      },
    },
    {
      title: 'Specialty',
      dataIndex: 'specialty',
      key: 'specialty',
      width: 160,
      render: (specialty: string | undefined, record: TeamMember) => {
        if (record.role !== 'DEVELOPER' && record.role !== 'PLATFORM_OWNER')
          return <span style={{ color: '#bbb' }}>—</span>;
        return (
          <Select
            value={specialty}
            size="small"
            placeholder="Select"
            style={{ width: 140 }}
            onChange={(val) => handleSpecialtyChange(record, val)}
            options={[
              { label: 'Frontend', value: 'FRONTEND' },
              { label: 'Backend', value: 'BACKEND' },
              { label: 'Full-stack', value: 'FULLSTACK' },
            ]}
          />
        );
      },
    },
    {
      title: 'Projects',
      key: 'projects',
      width: 260,
      render: (_: any, record: TeamMember) => {
        // Only show project assignments for developers and platform owners
        if (record.role !== 'DEVELOPER' && record.role !== 'PLATFORM_OWNER') {
          return <span style={{ color: '#bbb' }}>—</span>;
        }
        // Build select value: empty projectIds → show 'all'
        const value: (number | 'all')[] =
          record.projectIds && record.projectIds.length > 0
            ? record.projectIds
            : ['all'];

        const options = [
          { label: 'All Projects', value: 'all' as any },
          ...projects.map((p) => ({ label: p.name, value: p.id })),
        ];

        return (
          <Select
            mode="multiple"
            size="small"
            style={{ width: 240 }}
            value={value}
            loading={projectsSaving[record.id]}
            options={options}
            onChange={(selected: (number | 'all')[]) => {
              // If 'all' was just picked, strip everything else
              const hadAll = value.includes('all');
              const nowHasAll = selected.includes('all' as any);
              let next: (number | 'all')[];
              if (!hadAll && nowHasAll) {
                // user just picked 'all' — clear specific selections
                next = ['all'];
              } else if (hadAll && selected.length > 1) {
                // user picked a specific project while 'all' was set — drop 'all'
                next = selected.filter((v) => v !== 'all');
              } else if (selected.length === 0) {
                // nothing selected — default back to 'all'
                next = ['all'];
              } else {
                next = selected;
              }
              handleProjectAssignments(record.id, next);
            }}
            tagRender={(props) => {
              const { value: v, closable, onClose } = props;
              if (v === 'all') return <Tag color="blue" closable={closable} onClose={onClose}>All</Tag>;
              return (
                <Tag closable={closable} onClose={onClose} style={{ marginRight: 2 }}>
                  {projectMap[v as number] || `#${v}`}
                </Tag>
              );
            }}
            placeholder="All Projects"
            showSearch
            filterOption={(input, option) =>
              String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
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
        <Form form={form} layout="vertical" initialValues={{ role: 'SUPER_ADMIN' }}>
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
              { label: 'Platform Owner — Full access, can manage team & all projects', value: 'PLATFORM_OWNER' },
              { label: 'Super Admin — Can manage tickets & projects in the org', value: 'SUPER_ADMIN' },
              { label: 'Developer — Receives assigned tickets based on specialty', value: 'DEVELOPER' },
              { label: 'Viewer — Read-only access to tickets & dashboards', value: 'VIEWER' },
            ]} />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) => prev.role !== curr.role}
          >
            {({ getFieldValue }) =>
              getFieldValue('role') === 'DEVELOPER' ? (
                <Form.Item
                  name="specialty"
                  label="Specialty"
                  rules={[{ required: true, message: 'Specialty is required for developers' }]}
                  extra="Determines which tickets show this developer in the assignment dropdown."
                >
                  <Select options={[
                    { label: 'Frontend', value: 'FRONTEND' },
                    { label: 'Backend', value: 'BACKEND' },
                    { label: 'Full-stack (eligible for any ticket)', value: 'FULLSTACK' },
                  ]} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TeamPage;
