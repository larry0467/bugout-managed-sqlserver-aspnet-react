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
}

export declare const BugOutManagedWidget: default_2.FC<BugOutManagedConfig>;

export { }
