export type AppConfig = {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
};

let cached: Promise<AppConfig> | undefined;

export function loadConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = readConfig();
  }
  return cached;
}

async function readConfig(): Promise<AppConfig> {
  if (import.meta.env.DEV) {
    const apiUrl = import.meta.env.VITE_API_URL;
    const userPoolId = import.meta.env.VITE_USER_POOL_ID;
    const userPoolClientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;
    const region = import.meta.env.VITE_USER_POOL_REGION;
    if (!apiUrl || !userPoolId || !userPoolClientId || !region) {
      throw new Error("Copy web/.env.example to web/.env for local development.");
    }
    return {
      apiUrl: "",
      userPoolId,
      userPoolClientId,
      region,
    };
  }

  const response = await fetch("/config.json");
  if (!response.ok) {
    throw new Error("Failed to load /config.json");
  }
  const json = (await response.json()) as Record<string, unknown>;
  return {
    apiUrl: String(json.apiUrl ?? "").replace(/\/$/, ""),
    userPoolId: String(json.userPoolId ?? ""),
    userPoolClientId: String(json.userPoolClientId ?? ""),
    region: String(json.region ?? ""),
  };
}
