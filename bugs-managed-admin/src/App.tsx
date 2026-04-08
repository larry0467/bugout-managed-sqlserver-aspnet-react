import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, Button, Typography } from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  BugOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import TicketsPage from './pages/TicketsPage';
import SettingsPage from './pages/SettingsPage';
import TeamPage from './pages/TeamPage';
import LoginPage from './pages/LoginPage';
import type { AuthUser, Organization } from './api';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bom_token');
    const savedUser = localStorage.getItem('bom_user');
    const savedOrg = localStorage.getItem('bom_org');
    if (token && savedUser && savedOrg) {
      setUser(JSON.parse(savedUser));
      setOrg(JSON.parse(savedOrg));
    }
    setReady(true);
  }, []);

  const handleLogin = (token: string, user: AuthUser, org: Organization) => {
    localStorage.setItem('bom_token', token);
    localStorage.setItem('bom_user', JSON.stringify(user));
    localStorage.setItem('bom_org', JSON.stringify(org));
    setUser(user);
    setOrg(org);
    navigate('/');
  };

  const handleLogout = () => {
    localStorage.removeItem('bom_token');
    localStorage.removeItem('bom_user');
    localStorage.removeItem('bom_org');
    setUser(null);
    setOrg(null);
    navigate('/login');
  };

  if (!ready) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const isPlatformAdmin = user.role === 'PLATFORM_ADMIN';

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/projects', icon: <ProjectOutlined />, label: <Link to="/projects">Applications</Link> },
    { key: '/tickets', icon: <BugOutlined />, label: <Link to="/tickets">Tickets</Link> },
    { key: '/team', icon: <TeamOutlined />, label: <Link to="/team">Team</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} style={{ background: '#0a0a0a' }}>
        <div style={{
          padding: '20px 24px',
          fontSize: 18,
          fontWeight: 700,
          background: 'linear-gradient(135deg, #4caf50, #ff9800)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          Bug Out Managed
        </div>
        {org && (
          <div style={{ padding: '0 24px 12px', fontSize: 12, color: '#888' }}>
            {org.name} {isPlatformAdmin && <span style={{ color: '#4caf50' }}>(Platform)</span>}
          </div>
        )}
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ background: '#0a0a0a', borderRight: 'none' }}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#141414', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
          <Text style={{ color: '#888', fontSize: 13 }}>
            <UserOutlined /> {user.fullName}
          </Text>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: '#888' }}>
            Logout
          </Button>
        </Header>
        <Content style={{ margin: 24, background: '#0a0a0a', borderRadius: 8, padding: 24 }}>
          <Routes>
            <Route path="/" element={<DashboardPage isPlatformAdmin={isPlatformAdmin} />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/tickets" element={<TicketsPage isPlatformAdmin={isPlatformAdmin} />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
