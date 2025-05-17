// Add type declarations for our custom fetch implementation
declare const fetch: typeof globalThis.fetch;

declare module 'node-fetch' {
  export * from 'node-fetch';
  export { default } from 'node-fetch';
}
