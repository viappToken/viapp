import { findTomlCurrency, resolveStellarToml, type StellarTomlData } from "./sep1.js";

export interface Sep8AssetConfig {
  code: string;
  issuer?: string;
  approvalServer: string;
  approvalCriteria?: string;
}

export interface Sep8SuccessResponse {
  status: "success";
  tx: string;
  message?: string;
}

export interface Sep8RevisedResponse {
  status: "revised";
  tx: string;
  message: string;
}

export interface Sep8PendingResponse {
  status: "pending";
  timeout?: number;
  message?: string;
}

export interface Sep8ActionRequiredResponse {
  status: "action_required";
  message: string;
  actionUrl: string;
  actionMethod: "GET" | "POST";
  actionFields?: string[];
}

export interface Sep8RejectedResponse {
  status: "rejected";
  error: string;
}

export type Sep8ApprovalResponse =
  | Sep8SuccessResponse
  | Sep8RevisedResponse
  | Sep8PendingResponse
  | Sep8ActionRequiredResponse
  | Sep8RejectedResponse;

export interface Sep8ClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowHttp?: boolean;
}

export class Sep8ProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Sep8ProtocolError";
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Sep8ProtocolError(`SEP-8 response field '${field}' must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requireString(value, field);
}

function normalizeApprovalServer(value: string, allowHttp: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Sep8ProtocolError("SEP-8 approval_server must be an absolute URL");
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Sep8ProtocolError("SEP-8 approval_server must use HTTPS");
  }
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

/**
 * Reads the SEP-8 approval configuration advertised for an asset in SEP-1 stellar.toml.
 * A missing `regulated` flag means the asset is not regulated, per SEP-8.
 */
export function findSep8AssetConfig(
  toml: StellarTomlData,
  assetCode: string,
  issuer?: string,
  options: { allowHttp?: boolean } = {},
): Sep8AssetConfig {
  const currency = findTomlCurrency(toml, assetCode, issuer);
  if (!currency) throw new Sep8ProtocolError(`Asset ${assetCode} was not found in stellar.toml`);
  if (issuer && currency.issuer !== issuer) {
    throw new Sep8ProtocolError(`Asset ${assetCode} in stellar.toml does not match issuer ${issuer}`);
  }
  if (currency.regulated !== true) {
    throw new Sep8ProtocolError(`Asset ${assetCode} is not advertised as regulated`);
  }
  if (!currency.approval_server) {
    throw new Sep8ProtocolError(`Asset ${assetCode} has no approval_server in stellar.toml`);
  }
  return {
    code: currency.code,
    ...(currency.issuer ? { issuer: currency.issuer } : {}),
    approvalServer: normalizeApprovalServer(currency.approval_server, options.allowHttp ?? false),
    ...(currency.approval_criteria ? { approvalCriteria: currency.approval_criteria } : {}),
  };
}

/** Resolves stellar.toml and extracts the SEP-8 configuration for one regulated asset. */
export async function resolveSep8AssetConfig(
  domain: string,
  assetCode: string,
  issuer?: string,
  options: { allowHttp?: boolean; timeout?: number } = {},
): Promise<Sep8AssetConfig> {
  const toml = await resolveStellarToml(domain, options);
  return findSep8AssetConfig(toml, assetCode, issuer, options);
}

/** Minimal client for a SEP-8 regulated-asset approval server. */
export class Sep8Client {
  readonly approvalServerUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(approvalServerUrl: string, options: Sep8ClientOptions = {}) {
    this.approvalServerUrl = normalizeApprovalServer(approvalServerUrl, options.allowHttp ?? false);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 60_000) {
      throw new Sep8ProtocolError("SEP-8 timeoutMs must be an integer between 1 and 60000");
    }
  }

  static async fromDomain(
    domain: string,
    assetCode: string,
    issuer?: string,
    options: Sep8ClientOptions & { timeout?: number } = {},
  ): Promise<Sep8Client> {
    const config = await resolveSep8AssetConfig(domain, assetCode, issuer, {
      allowHttp: options.allowHttp,
      timeout: options.timeout,
    });
    return new Sep8Client(config.approvalServer, options);
  }

  /** Submit a signed transaction envelope to the issuer's approval server. */
  async requestApproval(transaction: string): Promise<Sep8ApprovalResponse> {
    if (typeof transaction !== "string" || transaction.trim() === "") {
      throw new Sep8ProtocolError("SEP-8 transaction must be a non-empty base64 envelope");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.approvalServerUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tx: transaction }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Sep8ProtocolError(`SEP-8 approval request failed: ${detail}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Sep8ProtocolError(`SEP-8 approval server returned non-JSON HTTP ${response.status}`);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Sep8ProtocolError("SEP-8 approval server returned a non-object response");
    }

    const body = payload as Record<string, unknown>;
    const status = body.status;
    if (status === "rejected") {
      if (response.status !== 400) {
        throw new Sep8ProtocolError(`SEP-8 rejected response must use HTTP 400, received ${response.status}`);
      }
      return { status, error: requireString(body.error, "error") };
    }
    if (response.status !== 200) {
      throw new Sep8ProtocolError(`SEP-8 ${String(status)} response must use HTTP 200, received ${response.status}`);
    }

    switch (status) {
      case "success":
        return {
          status,
          tx: requireString(body.tx, "tx"),
          ...(body.message === undefined ? {} : { message: optionalString(body.message, "message")! }),
        };
      case "revised":
        return {
          status,
          tx: requireString(body.tx, "tx"),
          message: requireString(body.message, "message"),
        };
      case "pending": {
        const timeout = body.timeout;
        if (timeout !== undefined && (!Number.isInteger(timeout) || (timeout as number) < 0)) {
          throw new Sep8ProtocolError("SEP-8 pending.timeout must be a non-negative integer");
        }
        return {
          status,
          ...(timeout === undefined ? {} : { timeout: timeout as number }),
          ...(body.message === undefined ? {} : { message: optionalString(body.message, "message")! }),
        };
      }
      case "action_required": {
        const actionMethod = body.action_method ?? "GET";
        if (actionMethod !== "GET" && actionMethod !== "POST") {
          throw new Sep8ProtocolError("SEP-8 action_method must be GET or POST");
        }
        const actionFields = body.action_fields;
        if (
          actionFields !== undefined &&
          (!Array.isArray(actionFields) || actionFields.some((field) => typeof field !== "string" || !field))
        ) {
          throw new Sep8ProtocolError("SEP-8 action_fields must be an array of non-empty strings");
        }
        const actionUrl = requireString(body.action_url, "action_url");
        try {
          new URL(actionUrl);
        } catch {
          throw new Sep8ProtocolError("SEP-8 action_url must be an absolute URL");
        }
        return {
          status,
          message: requireString(body.message, "message"),
          actionUrl,
          actionMethod,
          ...(actionFields === undefined ? {} : { actionFields: actionFields as string[] }),
        };
      }
      default:
        throw new Sep8ProtocolError(`Unknown SEP-8 approval status: ${String(status)}`);
    }
  }
}
