import type { NextRequest } from "next/server";
import { EnvError } from "@viapp/core/src/env.js";
import { clientFromHeaders, json, MAX_BODY_BYTES, route, type ViappRequest, type ViappResponse, type ServerDeps } from "@viapp/core/src/http.js";
import { handleStocks } from "@viapp/core/src/stocks.js";
import { handleQuote } from "@viapp/core/src/quote.js";
import { handleClaim } from "@viapp/core/src/claim.js";
import { parseGiftId } from "@viapp/core/src/gift.js";
import {
  executeStellarCreateGift,
  executeStellarRelayerClaim,
  getTestnetOperatorKeypair,
  readStellarGift,
  readStellarVaultStats,
} from "@viapp/core/src/stellar-rpc.js";
import { BootError, createServerDeps } from "@viapp/core/src/server-deps.js";

export const runtime = "nodejs";
export const maxDuration = 150;
export const dynamic = "force-dynamic";

const BOOT_RETRY_MS = 30_000;
const PLATFORM = process.env.VERCEL === "1" ? "vercel" : "local";
const LOCAL_SOCKET_IP = "127.0.0.1";

type Boot = { deps: Promise<ServerDeps>; failedAt: number | null };
let boot: Boot | null = null;

function bootMessage(err: unknown): string {
  if (err instanceof EnvError || err instanceof BootError) return err.message;
  return err instanceof Error ? `${err.name} while building the server.` : "an unknown error while building the server.";
}

function startBoot(): Boot {
  const attempt: Boot = { deps: createServerDeps(), failedAt: null };
  attempt.deps.catch((err: unknown) => {
    attempt.failedAt = Date.now();
    console.error(`ViApp API optional EVM boot notice: ${bootMessage(err)}`);
  });
  return attempt;
}

async function serverDeps(): Promise<ServerDeps | null> {
  if (boot === null || (boot.failedAt !== null && Date.now() - boot.failedAt >= BOOT_RETRY_MS)) boot = startBoot();
  try {
    return await boot.deps;
  } catch {
    return null;
  }
}

function plainHeaders(headers: Headers): Record<string, string | undefined> {
  const out = Object.create(null) as Record<string, string | undefined>;
  headers.forEach((value, name) => {
    out[name.toLowerCase()] = value;
  });
  return out;
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

async function readCappedBody(request: NextRequest): Promise<string | null> {
  if (request.body === null) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size <= MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, MAX_BODY_BYTES + 1 - size);
      chunks.push(part);
      size += part.byteLength;
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return size === 0 ? null : Buffer.concat(chunks, size).toString("utf8");
}

async function handle(request: NextRequest): Promise<Response> {
  let answer: ViappResponse;
  try {
    const path = pathOf(request.url);

    // 1. Live Stellar stocks catalog
    if (path === "/api/stocks" && !request.url.includes("chain=bnb")) {
      const res = await handleStocks({ chain: "stellar" });
      answer = json(res.status, res.body);
      return new Response(answer.body, { status: answer.status, headers: answer.headers });
    }

    // 2. Live Stellar Soroban GiftVault statistics (nextGiftId, made, opened, waiting, latest)
    if (path === "/api/stats" && request.method === "GET") {
      try {
        const stats = await readStellarVaultStats();
        answer = json(200, { ok: true, ...stats });
      } catch {
        answer = json(502, { ok: false, error: "chain_unavailable" });
      }
      return new Response(answer.body, { status: answer.status, headers: answer.headers });
    }

    // 3. Live Stellar Soroban Gift status read (GET /api/gift/:id)
    if (path.startsWith("/api/gift/") && request.method === "GET" && !request.url.includes("chain=bnb")) {
      const idText = path.slice("/api/gift/".length);
      let giftId: bigint;
      try {
        giftId = parseGiftId(idText);
      } catch {
        answer = json(400, { ok: false, error: "bad_gift_id" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
      try {
        const gift = await readStellarGift(giftId);
        if (!gift) {
          answer = json(404, { ok: false, error: "not_found" });
        } else {
          answer = json(200, gift);
        }
      } catch {
        answer = json(502, { ok: false, error: "chain_unavailable" });
      }
      return new Response(answer.body, { status: answer.status, headers: answer.headers });
    }

    const headers = plainHeaders(request.headers);
    const place = clientFromHeaders(headers, PLATFORM, { socketIp: LOCAL_SOCKET_IP, devCountry: process.env.VIAPP_DEV_COUNTRY ?? "DE" });
    const rawBody = await readCappedBody(request);

    // 4. Stellar or Unified Quote (POST /api/quote)
    if (path === "/api/quote" && request.method === "POST") {
      let parsedBody: unknown = null;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        answer = json(400, { ok: false, error: "bad_json" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }

      const deps = await serverDeps();
      const res = await handleQuote(
        {
          api: deps?.api,
          client: deps?.client,
          vault: deps?.vault,
          devAllowUnknownCountry: true,
          stellarPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015",
        },
        parsedBody,
        place,
      );

      if (res.status === 200 || (res.status === 400 && res.body.error !== "not_listed")) {
        answer = json(res.status, res.body);
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
      if (deps === null) {
        answer = json(503, { ok: false, error: "server_not_configured" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
      answer = json(res.status, res.body);
      return new Response(answer.body, { status: answer.status, headers: answer.headers });
    }

    // 5. Stellar On-Chain Gift Creation (POST /api/gift/create)
    if (path === "/api/gift/create" && request.method === "POST") {
      let parsedBody: any = null;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        answer = json(400, { ok: false, error: "bad_json" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
      if (!parsedBody || typeof parsedBody !== "object") {
        answer = json(400, { ok: false, error: "bad_json" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
      try {
        const res = await executeStellarCreateGift({
          symbol: String(parsedBody.symbol ?? "NVDA"),
          amountRaw: BigInt(parsedBody.amountRaw ?? "1000000"),
          claimKeyAddress: String(parsedBody.claimKeyAddress ?? ""),
          keyProofHex: String(parsedBody.keyProofHex ?? ""),
          sealedNoteHex: String(parsedBody.sealedNoteHex ?? "0x"),
          expiryDays: Number(parsedBody.expiryDays ?? 30),
        });
        answer = json(res.ok ? 200 : 400, res);
      } catch {
        answer = json(502, { ok: false, error: "chain_failed" });
      }
      return new Response(answer.body, { status: answer.status, headers: answer.headers });
    }

    // 6. Stellar Gasless Relayer Claim (POST /api/claim)
    if (path === "/api/claim" && request.method === "POST") {
      let parsedBody: any = null;
      try {
        parsedBody = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        answer = json(400, { ok: false, error: "bad_json" });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }

      if (
        parsedBody &&
        typeof parsedBody === "object" &&
        (parsedBody.chain === "stellar" ||
          (typeof parsedBody.recipient === "string" && parsedBody.recipient.startsWith("G")))
      ) {
        const check = await handleClaim(
          { devAllowUnknownCountry: true } as any,
          parsedBody,
          place,
        );
        if (check.status !== 200 || !check.body.ok) {
          answer = json(check.status, check.body);
          return new Response(answer.body, { status: answer.status, headers: answer.headers });
        }
        const liveClaim = await executeStellarRelayerClaim({
          giftId: BigInt(parsedBody.giftId),
          recipient: String(parsedBody.recipient),
          signature: String(parsedBody.signature),
          relayerSecret: getTestnetOperatorKeypair().secret(),
        });
        if (!liveClaim.ok) {
          answer = json(409, { ok: false, error: liveClaim.error });
          return new Response(answer.body, { status: answer.status, headers: answer.headers });
        }
        answer = json(200, { ok: true, txHash: liveClaim.txHash, reused: false });
        return new Response(answer.body, { status: answer.status, headers: answer.headers });
      }
    }

    const deps = await serverDeps();
    if (deps === null) {
      answer = json(503, { ok: false, error: "server_not_configured" });
    } else {
      const viappRequest: ViappRequest = { method: request.method, path, headers, body: rawBody, ...place };
      answer = await route(deps, viappRequest);
    }
  } catch {
    answer = json(500, { ok: false, error: "internal" });
  }
  return new Response(answer.body, { status: answer.status, headers: answer.headers });
}

export const GET = handle;
export const POST = handle;
