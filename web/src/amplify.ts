import { loadConfig } from "./config";

let configured: Promise<void> | undefined;

export function ensureAmplify(): Promise<void> {
  if (!configured) {
    configured = (async () => {
      const config = await loadConfig();
      const { Amplify } = await import("aws-amplify");
      Amplify.configure({
        Auth: {
          Cognito: {
            userPoolId: config.userPoolId,
            userPoolClientId: config.userPoolClientId,
          },
        },
      });
    })();
  }
  return configured;
}
