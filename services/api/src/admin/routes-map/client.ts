import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { ROUTE_MAP_LIMIT, type RouteMapRow } from "@smartshop/shared";
import { GoogleAuth, type JWTInput } from "google-auth-library";
import {
  type BqQueryResponse,
  RouteMapNotConfigured,
  routeMapConfig,
  routeMapSql,
  rowsFromBigQuery,
} from "./query.js";

const BQ_SCOPE = "https://www.googleapis.com/auth/bigquery";
const QUERY_DEADLINE_MS = 25_000;

let cachedSecret: string | undefined;
let auth: GoogleAuth | undefined;
let authEmail: string | undefined;

export async function queryRouteMap(): Promise<RouteMapRow[]> {
  const raw = await loadServiceAccountJson();
  if (!raw) {
    throw new RouteMapNotConfigured();
  }
  const credentials = parseServiceAccount(raw);
  const { project, dataset } = routeMapConfig();
  const token = await accessToken(credentials);
  return runQuery(token, project, routeMapSql(project, dataset));
}

async function loadServiceAccountJson(): Promise<string | undefined> {
  const fromEnv = process.env.BQ_SERVICE_ACCOUNT_JSON?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const secretId = process.env.BQ_READER_SECRET_ID?.trim();
  if (!secretId) {
    return undefined;
  }
  if (cachedSecret) {
    return cachedSecret;
  }
  const client = new SecretsManagerClient({});
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  const value = result.SecretString?.trim();
  if (!value) {
    return undefined;
  }
  cachedSecret = value;
  return value;
}

function parseServiceAccount(raw: string): JWTInput {
  let parsed: JWTInput;
  try {
    parsed = JSON.parse(raw) as JWTInput;
  } catch {
    throw new Error("BigQuery service account JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("BigQuery service account JSON is missing client_email or private_key");
  }
  return parsed;
}

async function accessToken(credentials: JWTInput): Promise<string> {
  const email = credentials.client_email ?? "";
  if (!auth || authEmail !== email) {
    auth = new GoogleAuth({ credentials, scopes: [BQ_SCOPE] });
    authEmail = email;
  }
  const client = await auth.getClient();
  const access = await client.getAccessToken();
  if (!access.token) {
    throw new Error("BigQuery access token was empty");
  }
  return access.token;
}

async function runQuery(token: string, project: string, sql: string): Promise<RouteMapRow[]> {
  const deadline = Date.now() + QUERY_DEADLINE_MS;
  let body = await postQuery(token, project, sql);
  while (body.jobComplete === false) {
    if (Date.now() > deadline) {
      throw new Error("BigQuery query timed out");
    }
    const jobId = body.jobReference?.jobId;
    if (!jobId) {
      throw new Error("BigQuery did not return a job id");
    }
    await sleep(400);
    body = await getQueryResults(token, project, jobId, body.jobReference?.location, body.pageToken);
  }
  const failure = body.error?.message ?? body.errors?.[0]?.message;
  if (failure) {
    throw new Error(failure);
  }
  const routes = rowsFromBigQuery(body);
  let pageToken = body.pageToken;
  while (pageToken && routes.length < ROUTE_MAP_LIMIT) {
    const jobId = body.jobReference?.jobId;
    if (!jobId) {
      break;
    }
    body = await getQueryResults(token, project, jobId, body.jobReference?.location, pageToken);
    for (const row of rowsFromBigQuery(body)) {
      if (routes.length >= ROUTE_MAP_LIMIT) {
        break;
      }
      routes.push(row);
    }
    pageToken = body.pageToken;
  }
  return routes;
}

async function postQuery(token: string, project: string, sql: string): Promise<BqQueryResponse> {
  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: sql,
        useLegacySql: false,
        timeoutMs: 20_000,
        maxResults: ROUTE_MAP_LIMIT,
      }),
      signal: AbortSignal.timeout(QUERY_DEADLINE_MS),
    },
  );
  return readQueryResponse(response);
}

async function getQueryResults(
  token: string,
  project: string,
  jobId: string,
  location: string | undefined,
  pageToken: string | undefined,
): Promise<BqQueryResponse> {
  const params = new URLSearchParams({ maxResults: String(ROUTE_MAP_LIMIT) });
  if (location) {
    params.set("location", location);
  }
  if (pageToken) {
    params.set("pageToken", pageToken);
  }
  const response = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries/${encodeURIComponent(jobId)}?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(QUERY_DEADLINE_MS),
    },
  );
  return readQueryResponse(response);
}

async function readQueryResponse(response: Response): Promise<BqQueryResponse> {
  const text = await response.text();
  let body: BqQueryResponse = {};
  if (text) {
    try {
      body = JSON.parse(text) as BqQueryResponse;
    } catch {
      throw new Error(`BigQuery HTTP ${response.status}`);
    }
  }
  if (!response.ok) {
    throw new Error(body.error?.message ?? `BigQuery HTTP ${response.status}`);
  }
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
