import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";

/**
 * JWT-protected methods for `/{proxy+}`.
 *
 * Do not include ANY or OPTIONS. ANY would let the JWT authorizer handle
 * CORS preflight (no Authorization header) and return 401. Browsers treat
 * a non-2xx OPTIONS response as TypeError "Failed to fetch" even when
 * Access-Control-Allow-Origin is present.
 */
export const JWT_PROTECTED_METHODS: HttpMethod[] = [
  HttpMethod.GET,
  HttpMethod.POST,
  HttpMethod.PUT,
  HttpMethod.PATCH,
  HttpMethod.DELETE,
];
