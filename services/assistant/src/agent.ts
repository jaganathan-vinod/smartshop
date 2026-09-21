import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  assistantToolNameSchema,
  isExplicitConfirm,
  stripModelThinking,
  type AssistantInvokeResponse,
  type AssistantToolName,
  type ChatTurn,
} from "@smartshop/shared";
import { callShopTool } from "./tools-client.js";

const MAX_ITERATIONS = 8;

const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "search_products",
        description: "Search the SmartShop catalogue by name and optional category",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              q: { type: "string" },
              category: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_product",
        description: "Get one catalogue product by productId",
        inputSchema: {
          json: {
            type: "object",
            properties: { productId: { type: "string" } },
            required: ["productId"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_cart",
        description: "Get the signed-in customer's cart",
        inputSchema: { json: { type: "object", properties: {} } },
      },
    },
    {
      toolSpec: {
        name: "upsert_cart_item",
        description: "Add or update a cart line. Never invent productIds.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              productId: { type: "string" },
              quantity: { type: "number" },
            },
            required: ["productId", "quantity"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "remove_cart_item",
        description: "Remove a cart line",
        inputSchema: {
          json: {
            type: "object",
            properties: { productId: { type: "string" } },
            required: ["productId"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "set_delivery",
        description: "Set STANDARD or EXPRESS delivery for this conversation",
        inputSchema: {
          json: {
            type: "object",
            properties: { deliveryMethod: { type: "string", enum: ["STANDARD", "EXPRESS"] } },
            required: ["deliveryMethod"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_quote",
        description: "Price the cart. Always call this before confirm_order. Use returned cent fields; never invent totals.",
        inputSchema: {
          json: {
            type: "object",
            properties: { deliveryMethod: { type: "string", enum: ["STANDARD", "EXPRESS"] } },
          },
        },
      },
    },
    {
      toolSpec: {
        name: "confirm_order",
        description: "Place the order only after a quote was shown and the customer said an explicit yes",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              confirm: { type: "boolean" },
              deliveryMethod: { type: "string", enum: ["STANDARD", "EXPRESS"] },
            },
            required: ["confirm"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "list_orders",
        description: "List the customer's orders",
        inputSchema: { json: { type: "object", properties: {} } },
      },
    },
    {
      toolSpec: {
        name: "get_order",
        description: "Get one of the customer's orders",
        inputSchema: {
          json: {
            type: "object",
            properties: { orderId: { type: "string" } },
            required: ["orderId"],
          },
        },
      },
    },
  ],
};

const SYSTEM = `You are the SmartShop shopping assistant for one signed-in customer.
Use tools for catalogue, cart, quotes, and orders. Never invent productIds or money amounts.
Keep prior turns in mind: if you just offered a product and the customer says yes / add it / add to cart, call upsert_cart_item with that productId immediately. Do not ask for the product name again.
Quote totals must come from get_quote. Do not call confirm_order unless the customer's latest message is an explicit yes after a quote (for example "yes, place it").
When that explicit yes arrives, call confirm_order in the same turn. Do not ask for confirmation again.
Never call admin APIs. Keep replies short. Write product names in **bold**. Put price and facts on separate "- " lines.
Never include <thinking> tags, hidden reasoning, or chain-of-thought in the customer-facing reply.`;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function converseMessagesFromHistory(history: ChatTurn[] | undefined): Message[] {
  const messages: Message[] = [];
  for (const turn of history ?? []) {
    const text = turn.text.trim();
    if (!text) {
      continue;
    }
    const role = turn.role === "assistant" ? "assistant" : "user";
    if (role === "assistant" && messages.length === 0) {
      continue;
    }
    const last = messages[messages.length - 1];
    if (last?.role === role) {
      last.content = [...(last.content ?? []), { text }];
      continue;
    }
    messages.push({ role, content: [{ text }] });
  }
  return messages;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function decodeJwtSub(authorization: string | string[] | undefined): string | null {
  const raw = firstHeader(authorization);
  if (!raw) {
    return null;
  }
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    return typeof payload.sub === "string" && payload.sub.length >= 8 ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function runAssistantTurn(input: {
  userId: string;
  conversationId: string;
  message?: string;
  imageObjectKey?: string;
  lastUserMessage: string;
  history?: ChatTurn[];
}): Promise<AssistantInvokeResponse> {
  const apiUrl = process.env.SMARTSHOP_API_URL;
  const region = process.env.SMARTSHOP_REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "ap-southeast-1";
  const modelId = process.env.BEDROCK_MODEL_ID ?? "apac.amazon.nova-lite-v1:0";
  const uploadsBucket = process.env.ASSISTANT_UPLOADS_BUCKET;
  if (!apiUrl) {
    throw new Error("SMARTSHOP_API_URL is required");
  }

  const bedrock = new BedrockRuntimeClient({ region });
  const toolsUsed: AssistantToolName[] = [];
  let orderNumber: string | undefined;

  const userContent: Message["content"] = [];
  if (input.message?.trim()) {
    userContent.push({ text: input.message.trim() });
  }
  if (input.imageObjectKey && uploadsBucket) {
    const s3 = new S3Client({ region });
    const object = await s3.send(
      new GetObjectCommand({ Bucket: uploadsBucket, Key: input.imageObjectKey }),
    );
    const bytes = await object.Body?.transformToByteArray();
    if (bytes) {
      userContent.push({
        image: { format: "jpeg", source: { bytes } },
      });
    }
  }
  if (!userContent.length) {
    userContent.push({ text: "Hello" });
  }

  const messages: Message[] = converseMessagesFromHistory(input.history);
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    last.content = [...(last.content ?? []), ...userContent];
  } else {
    messages.push({ role: "user", content: userContent });
  }
  const userConfirmed = isExplicitConfirm(input.lastUserMessage);

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const response = await bedrock.send(
      new ConverseCommand({
        modelId,
        system: [{ text: SYSTEM }],
        messages,
        toolConfig: TOOL_CONFIG,
      }),
    );
    const output = response.output?.message;
    if (!output) {
      break;
    }
    messages.push(output);
    const toolUses = (output.content ?? []).filter((block) => "toolUse" in block);
    if (response.stopReason !== "tool_use" || toolUses.length === 0) {
      const text = (output.content ?? [])
        .map((block) => ("text" in block ? block.text : ""))
        .filter(Boolean)
        .join("\n")
        .trim();
      return {
        conversationId: input.conversationId,
        reply: stripModelThinking(text) || "I could not complete that turn.",
        toolsUsed,
        orderNumber,
      };
    }

    const toolResults: NonNullable<Message["content"]> = [];
    for (const block of toolUses) {
      if (!("toolUse" in block) || !block.toolUse) {
        continue;
      }
      const nameParse = assistantToolNameSchema.safeParse(block.toolUse.name);
      const toolUseId = block.toolUse.toolUseId ?? "tool";
      if (!nameParse.success) {
        toolResults.push({
          toolResult: {
            toolUseId,
            content: [{ json: { error: { code: "UNKNOWN_TOOL", message: "Tool is not allowed" } } }],
            status: "error",
          },
        });
        continue;
      }
      const tool = nameParse.data;
      if (tool === "confirm_order" && !userConfirmed) {
        toolResults.push({
          toolResult: {
            toolUseId,
            content: [
              {
                json: {
                  error: {
                    code: "CONFIRM_REQUIRED",
                    message: "Customer must explicitly confirm after a quote",
                  },
                },
              },
            ],
            status: "error",
          },
        });
        continue;
      }
      toolsUsed.push(tool);
      const result = await callShopTool({
        apiUrl,
        region,
        userId: input.userId,
        conversationId: input.conversationId,
        tool,
        args: asRecord(block.toolUse.input),
        userConfirmed,
      });
      const resultBody = asRecord(result.body);
      const maybeOrder = asRecord(resultBody.result);
      if (typeof maybeOrder.orderNumber === "string") {
        orderNumber = maybeOrder.orderNumber;
      }
      toolResults.push({
        toolResult: {
          toolUseId,
          content: [{ json: result.body as Record<string, unknown> }],
          status: result.status >= 400 ? "error" : "success",
        },
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    conversationId: input.conversationId,
    reply: "I reached the tool-call limit. Try a shorter request.",
    toolsUsed,
    orderNumber,
  };
}
