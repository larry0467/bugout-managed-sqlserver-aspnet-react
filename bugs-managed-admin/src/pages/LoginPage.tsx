import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Tabs } from 'antd';
import { LockOutlined, MailOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';
import { authApi } from '../api';

const { Title, Text } = Typography;

interface LoginPageProps {
  onLogin: (token: string, user: any, org: any) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const handleLogin = async () => {
    setLoading(true);
    try {
      const values = await loginForm.validateFields();
      const result = await authApi.login(values.email, values.password);
      onLogin(result.token, result.user, result.organization);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    try {
      const values = await registerForm.validateFields();
      const result = await authApi.register(values);
      onLogin(result.token, result.user, result.organization);
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{ width: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{
            margin: 0,
            background: 'linear-gradient(135deg, #4caf50, #ff9800)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Bug Out Managed
          </Title>
          <Text type="secondary">Dev Portal</Text>
        </div>

        <Card style={{ background: '#141414', border: '1px solid #222' }}>
          <Tabs
            centered
            items={[
              {
                key: 'login',
                label: 'Sign In',
                children: (
                  <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
                    <Form.Item name="email" rules={[{ required: true, message: 'Email is required' }]}>
                      <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: 'Password is required' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                      Sign In
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: 'Register',
                children: (
                  <Form form={registerForm} layout="vertical" onFinish={handleRegister}>
                    <Form.Item name="fullName" rules={[{ required: true, message: 'Name is required' }]}>
                      <Input prefix={<UserOutlined />} placeholder="Full Name" size="large" />
                    </Form.Item>
                    <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email is required' }]}>
                      <Input prefix={<MailOutlined />} placeholder="Email" size="large" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, min: 6, message: 'Min 6 characters' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
                    </Form.Item>
                    <Form.Item name="organizationName" rules={[{ required: true, message: 'Organization name is required' }]}>
                      <Input prefix={<BankOutlined />} placeholder="Organization Name" size="large" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                      Create Account
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
