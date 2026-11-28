import { afterEach, describe, expect, it, vi } from "vitest";
import { parseStellarTomlText } from "../src/sep1.js";
import {
  findSep8AssetConfig,
  Sep8Client,
  Sep8ProtocolError,
  type Sep8ApprovalResponse,
} from "../src/sep8.js";

const ISSUER = "GD5T6IPRNCKFOHQWT264YPKOZAWUMMZOLZBJ6BNQMUGPWGRLBK3U7ZNP";
const APPROVAL_SERVER = "https://issuer.example/tx_approve";

function responseFor(status: Sep8ApprovalResponse["status"], extra: Record<string, unknown> = {}) {
  const bodies: Record<Sep8ApprovalResponse["status"], Record<string, unknown>> = {
    success: { status, tx: "signed-envelope", ...extra },
    revised: { status, tx: "revised-envelope", message: "Authorization operations added", ...extra },
    pending: { status, timeout: 5_000, message: "Compliance review in progress", ...extra },
    action_required: {
      status,
      message: "Accept the issuer agreement",
      action_url: "https://issuer.example/action",
      action_method: "POST",
      action_fields: ["email_address"],
      ...extra,
    },
    rejected: { status, error: "Destination account is blocked", ...extra },
  };
  return bodies[status];
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SEP-0008: Regulated asset discovery", () => {
  const toml = parseStellarTomlText(`
[[CURRENCIES]]
code="GOAT"
issuer="${ISSUER}"
regulated=true
approval_server="${APPROVAL_SERVER}"
approval_criteria="Only verified accounts are approved"

[[CURRENCIES]]
code="USDC"
issuer="${ISSUER}"
again="not regulated"
`);

  it("extracts a regulated asset's approval server and criteria", () => {
    expect(findSep8AssetConfig(toml, "GOAT", ISSUER)).toEqual({
      code: "GOAT",
      issuer: ISSUER,
      approvalServer: APPROVAL_SERVER,
      approvalCriteria: "Only verified accounts are approved",
    });
  });

  it("rejects unregulated assets and issuer mismatches", () => {
    expect(() => findSep8AssetConfig(toml, "USDC", ISSUER)).toThrow(/not advertised as regulated/);
    expect(() => findSep8AssetConfig(toml, "GOAT", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF")).toThrow(
      /was not found/,
    );
  });
});

describe("SEP-0008: approval responses", () => {
  it("handles success and sends the signed envelope as JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(responseFor("success")));
    const client = new Sep8Client(APPROVAL_SERVER, { fetchImpl });

    await expect(client.requestApproval("user-signed-envelope")).resolves.toEqual({
      status: "success",
      tx: "signed-envelope",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      APPROVAL_SERVER,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tx: "user-signed-envelope" }),
      }),
    );
  });

  it("handles revised transactions without discarding the issuer's explanation", async () => {
    const client = new Sep8Client(APPROVAL_SERVER, {
      fetchImpl: vi.fn().mockResolvedValueOnce(jsonResponse(responseFor("revised"))),
    });
    await expect(client.requestApproval("user-signed-envelope")).resolves.toEqual({
      status: "revised",
      tx: "revised-envelope",
      message: "Authorization operations added",
    });
  });

  it("handles pending review with a retry delay", async () => {
    const client = new Sep8Client(APPROVAL_SERVER, {
      fetchImpl: vi.fn().mockResolvedValueOnce(jsonResponse(responseFor("pending"))),
    });
    await expect(client.requestApproval("user-signed-envelope")).resolves.toEqual({
      status: "pending",
      timeout: 5_000,
      message: "Compliance review in progress",
    });
  });

  it("handles an action required response with method and requested fields", async () => {
    const client = new Sep8Client(APPROVAL_SERVER, {
      fetchImpl: vi.fn().mockResolvedValueOnce(jsonResponse(responseFor("action_required"))),
    });
    await expect(client.requestApproval("user-signed-envelope")).resolves.toEqual({
      status: "action_required",
      message: "Accept the issuer agreement",
      actionUrl: "https://issuer.example/action",
      actionMethod: "POST",
      actionFields: ["email_address"],
    });
  });

  it("handles a compliant rejection response", async () => {
    const client = new Sep8Client(APPROVAL_SERVER, {
      fetchImpl: vi.fn().mockResolvedValueOnce(jsonResponse(responseFor("rejected"), 400)),
    });
    await expect(client.requestApproval("user-signed-envelope")).resolves.toEqual({
      status: "rejected",
      error: "Destination account is blocked",
    });
  });

  it("fails closed on unknown statuses and mismatched HTTP codes", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ status: "maybe" }))
      .mockResolvedValueOnce(jsonResponse(responseFor("rejected"), 200));
    const client = new Sep8Client(APPROVAL_SERVER, { fetchImpl });

    await expect(client.requestApproval("one")).rejects.toThrow(/Unknown SEP-8 approval status/);
    await expect(client.requestApproval("two")).rejects.toBeInstanceOf(Sep8ProtocolError);
  });
});
