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
  TrophyOutlined,
} from '@ant-design/icons';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import TicketsPage from './pages/TicketsPage';
import SettingsPage from './pages/SettingsPage';
import TeamPage from './pages/TeamPage';
import LoginPage from './pages/LoginPage';
import PerformancePage from './pages/PerformancePage';
import SandboxBanner from './components/SandboxBanner';
import ManagedLauncher from './components/ManagedLauncher';
import type { AuthUser, Organization } from './api';

const { Content, Header } = Layout;
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
      <>
        {/* Banner mounts pre-login too — capabilities is anonymous so a
            prospect landing on /login still sees "you're in sandbox". */}
        <SandboxBanner user={null} />
        <Routes>
          <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </>
    );
  }

  const isPlatformAdmin = user.role === 'PLATFORM_OWNER';

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/projects', icon: <ProjectOutlined />, label: <Link to="/projects">Applications</Link> },
    { key: '/tickets', icon: <BugOutlined />, label: <Link to="/tickets">Tickets</Link> },
    { key: '/performance', icon: <TrophyOutlined />, label: <Link to="/performance">Performance</Link> },
    { key: '/team', icon: <TeamOutlined />, label: <Link to="/team">Team</Link> },
    { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Settings</Link> },
  ];

  return (
    <Layout style={{ minHeight: '100vh', flexDirection: 'column' }}>
      <SandboxBanner user={user} />
      {/* Top nav (was a left Sider). Wide-table pages like /tickets need every
          horizontal pixel; collapsing the sider didn't fully solve it, and
          users wanted full nav labels visible. Top nav reclaims ~140-220px
          of horizontal space across the app. */}
      <Header
        style={{
          background: '#0a0a0a',
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderBottom: '1px solid #1f1f1f',
          height: 56,
          lineHeight: '56px',
        }}
      >
        {/* Brand block: gradient logo + org tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              background: 'linear-gradient(135deg, #4caf50, #ff9800)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              whiteSpace: 'nowrap',
            }}
          >
            Bug Out Managed
          </span>
        </div>

        {/* Horizontal nav. Flex:1 so it fills the middle; menu's own overflow
            handling kicks in if the viewport is too narrow. */}
        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ background: 'transparent', borderBottom: 'none', flex: 1, minWidth: 0 }}
        />

        {/* User block on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Text style={{ color: '#bbb', fontSize: 13 }}>
            <UserOutlined /> {user.fullName}
          </Text>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: '#bbb' }}>
            Logout
          </Button>
        </div>
      </Header>

      <Content style={{ margin: 12, background: '#0a0a0a', borderRadius: 8, padding: 16 }}>
        <Routes>
          <Route path="/" element={<DashboardPage isPlatformAdmin={isPlatformAdmin} />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/tickets" element={<TicketsPage isPlatformAdmin={isPlatformAdmin} />} />
          <Route path="/performance" element={<PerformancePage isPlatformAdmin={isPlatformAdmin} />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} />} />
        </Routes>
      </Content>

      {/* Unified launcher orb — Messages + Report tabs. Position: bottom-right
          (no JARVIS chrome on the right in Bug Out admin). Unmounts on logout
          because user becomes null and the component is only rendered here. */}
      <ManagedLauncher userEmail={user.email} userName={user.fullName} />
    </Layout>
  );
};

export default App;
