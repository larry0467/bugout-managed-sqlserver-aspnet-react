import { default as default_2 } from 'react';

export declare interface BugOutManagedConfig {
    apiKey: string;
    apiUrl: string;
    userEmail?: string;
    userName?: string;
    theme?: 'dark' | 'light';
    position?: 'bottom-right' | 'bottom-left';
    orbSize?: number;
    orbColors?: [string, string];
    tenantId?: string;
    tenantName?: string;
    databaseName?: string;
    appVersion?: string;
    environment?: 'PRODUCTION' | 'STAGING' | 'DEVELOPMENT';
    onApiReady?: (api: {
        open: () => void;
        close: () => void;
    }) => void;
    hideOrb?: boolean;
}

declare const BugOutManagedWidget: default_2.FC<BugOutManagedConfig>;
export { BugOutManagedWidget }
export { BugOutManagedWidget as BugsManagedWidget }

export { }


declare global {
    interface Window {
        __ManagedLauncher__?: ManagedLauncherRegistry;
    }
}


declare global {
    interface Window {
        __BUG_OUT_CONFIG__?: BugOutManagedConfig;
        BugOutManagedWidget?: {
            mount: (config: BugOutManagedConfig) => void;
            unmount: () => void;
            open: () => void;
            close: () => void;
            /** Update the submitter identity after the user logs in. Safe to call
             *  multiple times (e.g. on auth state change). Re-renders the panel in
             *  place — no flash, no remount, no lost state. */
            setUser: (email: string, name: string) => void;
        };
    }
}


declare global {
    interface Window {
        __MANAGED_LAUNCHER_CONFIG__?: UnifiedLauncherConfig;
        ManagedLauncher?: {
            mount: (config: UnifiedLauncherConfig) => void;
            unmount: () => void;
            open: (tab?: PanelTab) => void;
            close: () => void;
            setUser: (email: string, name: string) => void;
        };
    }
}

