export { default as BugsManagedWidget } from './BugsManagedWidget';
// Back-compat alias — older consumers imported it as BugOutManagedWidget.
// Both names resolve to the same component until callers migrate.
export { default as BugOutManagedWidget } from './BugsManagedWidget';
export type { BugOutManagedConfig } from './types';
