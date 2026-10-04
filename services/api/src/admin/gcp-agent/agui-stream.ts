import { gcpAgentSessionIdSchema } from "@smartshop/shared";
import { AguiAuthError, verifyAdminBearer } from "./agui-auth.js";
import { writeAguiRun } from "./agui-run.js";

type ResponseStream = {
  write(chunk: string | Uint8Array): void;
  end(): void;
};

type StreamingRuntime = {
  streamifyResponse(
    handler: (event: unknown, responseStream: ResponseStream, context: unknown) => Promise<void>,
  ): unknown;
  HttpResponseStream: {
    from(
      stream: ResponseStream,
      metadata: { statusCode: number; headers: Record<string, string> },
    ): ResponseStream;
  };
};

type FunctionUrlEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export const handler = streamingRuntime().streamifyResponse(async (event, responseStream) => {
  const request = asFunctionUrl(event);
  const method = request?.requestContext?.http?.method?.toUpperCase() ?? "POST";
  if (method === "OPTIONS") {
    const stream = streamingRuntime().HttpResponseStream.from(responseStream, { statusCode: 204, headers: {} });
    stream.end();
    return;
  }
  try {
    const claims = await verifyAdminBearer(header(request, "authorization"));
    const stream = streamingRuntime().HttpResponseStream.from(responseStream, {
      statusCode: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
    await writeAguiRun({
      body: decodeBody(request),
      userId: claims.sub,
      existingSession: existingSession(header(request, "x-smartshop-session")),
      write: (chunk) => stream.write(chunk),
    });
    stream.end();
  } catch (error) {
    const status = error instanceof AguiAuthError ? error.status : 500;
    const message = error instanceof AguiAuthError ? error.message : "The agent did not answer";
    const stream = streamingRuntime().HttpResponseStream.from(responseStream, {
      statusCode: status,
      headers: { "Content-Type": "application/json" },
    });
    stream.write(JSON.stringify({ error: message }));
    stream.end();
  }
});

function streamingRuntime(): StreamingRuntime {
  const runtime = (globalThis as { awslambda?: StreamingRuntime }).awslambda;
  if (!runtime) {
    throw new Error("Response streaming is only available in Lambda");
  }
  return runtime;
}

function asFunctionUrl(event: unknown): FunctionUrlEvent | undefined {
  const record = event && typeof event === "object" ? (event as FunctionUrlEvent) : undefined;
  return record;
}

function header(event: FunctionUrlEvent | undefined, name: string): string | undefined {
  const headers = event?.headers;
  if (!headers) {
    return undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function existingSession(value: string | undefined): string | undefined {
  const parsed = gcpAgentSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function decodeBody(event: FunctionUrlEvent | undefined): unknown {
  if (!event?.body) {
    return {};
  }
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}
