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
}

declare const BugOutManagedWidget: default_2.FC<BugOutManagedConfig>;
export { BugOutManagedWidget }
export { BugOutManagedWidget as BugsManagedWidget }

export { }


declare global {
    interface Window {
        __BUG_OUT_CONFIG__?: BugOutManagedConfig;
        BugOutManagedWidget?: {
            mount: (config: BugOutManagedConfig) => void;
            unmount: () => void;
        };
    }
}

