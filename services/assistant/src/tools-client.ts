import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { Sha256 } from "@aws-crypto/sha256-js";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import {
  USER_CONFIRMED_HEADER,
  USER_ID_HEADER,
  type AssistantToolName,
} from "@smartshop/shared";

export async function callShopTool(input: {
  apiUrl: string;
  region: string;
  userId: string;
  conversationId: string;
  tool: AssistantToolName;
  args: Record<string, unknown>;
  userConfirmed: boolean;
}): Promise<{ status: number; body: unknown }> {
  const url = new URL(`${input.apiUrl.replace(/\/$/, "")}/v1/internal/assistant/tools`);
  const body = JSON.stringify({
    conversationId: input.conversationId,
    tool: input.tool,
    args: input.args,
  });
  const request = new HttpRequest({
    method: "POST",
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      host: url.host,
      "content-type": "application/json",
      [USER_ID_HEADER]: input.userId,
      [USER_CONFIRMED_HEADER]: input.userConfirmed ? "true" : "false",
    },
    body,
  });
  const signer = new SignatureV4({
    credentials: fromNodeProviderChain(),
    region: input.region,
    service: "execute-api",
    sha256: Sha256,
  });
  const signed = await signer.sign(request);
  const response = await fetch(url, {
    method: "POST",
    headers: signed.headers,
    body,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}
