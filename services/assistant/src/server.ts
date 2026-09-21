import { createServer } from "node:http";
import { ZodError } from "zod";
import { conversationIdSchema } from "@smartshop/shared";
import { decodeJwtSub, runAssistantTurn } from "./agent.js";
import { normalizeInvokePayload } from "./payload.js";

const PORT = Number(process.env.PORT ?? 8080);
const ALLOW_ORIGIN = process.env.SPA_ORIGIN ?? "*";

function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": ALLOW_ORIGIN,
    "access-control-allow-headers":
      "authorization,content-type,x-amzn-bedrock-agentcore-runtime-session-id",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }
  if (req.method === "GET" && (url.pathname === "/ping" || url.pathname === "/")) {
    json(res, 200, { status: "Healthy" });
    return;
  }
  if (req.method === "POST" && (url.pathname === "/invocations" || url.pathname === "/")) {
    try {
      const raw = JSON.parse((await readBody(req)) || "{}") as unknown;
      const payload = normalizeInvokePayload(raw);
      const userId = decodeJwtSub(req.headers.authorization);
      if (!userId) {
        json(res, 401, { error: { code: "UNAUTHENTICATED", message: "Sign in required" } });
        return;
      }
      const conversationId =
        payload.conversationId ??
        conversationIdSchema.parse(`conv-${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`);
      const message = payload.message ?? "";
      const result = await runAssistantTurn({
        userId,
        conversationId,
        message,
        imageObjectKey: payload.imageObjectKey,
        lastUserMessage: message,
        history: payload.history,
      });
      json(res, 200, result);
    } catch (error) {
      if (error instanceof ZodError || (error instanceof SyntaxError && error.message.includes("JSON"))) {
        json(res, 400, {
          error: {
            code: "VALIDATION_ERROR",
            message: error instanceof Error ? error.message : "Invalid request",
          },
        });
        return;
      }
      const message = error instanceof Error ? error.message : "Assistant backend error";
      process.stderr.write(`assistant turn failed: ${message}\n`);
      json(res, 200, {
        conversationId: "conv-error",
        reply: `I hit a backend error: ${message}`,
        toolsUsed: [],
      });
    }
    return;
  }
  json(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
});

server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`assistant listening on 0.0.0.0:${PORT}\n`);
});
