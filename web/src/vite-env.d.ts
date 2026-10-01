/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_USER_POOL_CLIENT_ID: string;
  readonly VITE_USER_POOL_REGION: string;
  readonly VITE_ASSISTANT_RUNTIME_URL?: string;
  readonly VITE_ASSISTANT_RUNTIME_ARN?: string;
  readonly VITE_MAPS_BROWSER_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
