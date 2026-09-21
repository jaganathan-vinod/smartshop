export type AppConfig = {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  assistantRuntimeArn?: string;
  assistantRuntimeUrl?: string;
};

let cached: Promise<AppConfig> | undefined;

export function loadConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = readConfig();
  }
  return cached;
}

export function assistantInvokeUrl(config: AppConfig): string | undefined {
  if (config.assistantRuntimeUrl) {
    return config.assistantRuntimeUrl.replace(/\/$/, "");
  }
  if (!config.assistantRuntimeArn) {
    return undefined;
  }
  const encoded = encodeURIComponent(config.assistantRuntimeArn);
  return `https://bedrock-agentcore.${config.region}.amazonaws.com/runtimes/${encoded}/invocations?qualifier=DEFAULT`;
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
    const assistantRuntimeUrl = import.meta.env.VITE_ASSISTANT_RUNTIME_URL;
    const assistantRuntimeArn = import.meta.env.VITE_ASSISTANT_RUNTIME_ARN;
    return {
      apiUrl: "",
      userPoolId,
      userPoolClientId,
      region,
      assistantRuntimeUrl: assistantRuntimeUrl || undefined,
      assistantRuntimeArn: assistantRuntimeArn || undefined,
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
    assistantRuntimeArn:
      typeof json.assistantRuntimeArn === "string" && json.assistantRuntimeArn
        ? json.assistantRuntimeArn
        : undefined,
    assistantRuntimeUrl:
      typeof json.assistantRuntimeUrl === "string" && json.assistantRuntimeUrl
        ? json.assistantRuntimeUrl
        : undefined,
  };
}
