import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { userProfileSchema, type UserProfile } from "@smartshop/shared";
import type { JwtClaims } from "../auth.js";
import { docClient } from "../db.js";
import { usersTableName } from "../env.js";

function nowIso(): string {
  return new Date().toISOString();
}

export async function upsertMe(claims: JwtClaims): Promise<UserProfile> {
  const existing = await getUser(claims.sub);
  const timestamp = nowIso();
  const email = claims.email ?? existing?.email;
  const displayName = claims.name ?? existing?.displayName;
  if (!email || !displayName) {
    throw Object.assign(new Error("PROFILE_INCOMPLETE"), {
      code: "PROFILE_INCOMPLETE",
    });
  }

  if (!existing) {
    const created = userProfileSchema.parse({
      userId: claims.sub,
      email,
      displayName,
      isPremium: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    try {
      await docClient.send(
        new PutCommand({
          TableName: usersTableName(),
          Item: created,
          ConditionExpression: "attribute_not_exists(userId)",
        }),
      );
      return created;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        const raced = await getUser(claims.sub);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  const updated = userProfileSchema.parse({
    ...existing,
    email,
    displayName,
    updatedAt: timestamp,
  });
  await docClient.send(
    new PutCommand({
      TableName: usersTableName(),
      Item: updated,
    }),
  );
  return updated;
}

export async function getUser(userId: string): Promise<UserProfile | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: usersTableName(),
      Key: { userId },
    }),
  );
  if (!result.Item) {
    return null;
  }
  const parsed = userProfileSchema.safeParse(result.Item);
  return parsed.success ? parsed.data : null;
}

export async function setPremium(
  userId: string,
  isPremium: boolean,
): Promise<UserProfile | null> {
  const existing = await getUser(userId);
  if (!existing) {
    return null;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: usersTableName(),
      Key: { userId },
      UpdateExpression: "SET isPremium = :p, updatedAt = :u",
      ExpressionAttributeValues: {
        ":p": isPremium,
        ":u": nowIso(),
      },
    }),
  );
  return { ...existing, isPremium, updatedAt: nowIso() };
}
