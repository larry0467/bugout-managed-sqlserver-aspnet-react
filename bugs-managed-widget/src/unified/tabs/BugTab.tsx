import React from 'react';
import BugsManagedWidget from '../../BugsManagedWidget';
import type { BugOutConfig, PanelSize, UserConfig } from '../types';

// Thin wrapper — renders the existing Bug Out submission form inside the
// unified panel. hideOrb=true suppresses its own floating button (the unified
// launcher owns the orb). The form fills the panel's flex space naturally.

interface Props {
  bugoutConfig: BugOutConfig;
  user: UserConfig | undefined;
  size: PanelSize;
  theme: 'dark' | 'light';
  tenantId?: string;
  tenantName?: string;
  appVersion?: string;
  environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
}

export default function BugTab({
  bugoutConfig,
  user,
  size: _size,
  theme,
  tenantId,
  tenantName,
  appVersion,
  environment,
}: Props) {
  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <BugsManagedWidget
        apiKey={bugoutConfig.apiKey}
        apiUrl={bugoutConfig.apiUrl}
        userEmail={user?.email}
        userName={user?.name}
        theme={theme}
        hideOrb
        tenantId={tenantId}
        tenantName={tenantName}
        appVersion={appVersion}
        environment={environment}
      />
    </div>
  );
}
