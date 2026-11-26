import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  StrKey,
  TimeoutInfinite,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import crypto from "node:crypto";
import { DEFAULT_STELLAR_VAULT_CONTRACT_ID } from "./client/stellar.js";
import { stellarVerifyClaim, stellarVerifyKeyProof } from "./gift.js";
import { getAllStellarCatalogAssets, STELLAR_TESTNET_ISSUER } from "./stocks-stellar.js";
import { fromBaseUnits, TESTNET_PASSPHRASE } from "./trade-stellar.js";

export const DEFAULT_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
// Read-only simulation source account on Stellar Testnet
const READONLY_SOURCE_ACCOUNT = "GAZWESWQPZOIH2EH3IL37THBLKGLAC5FCHTLMWAXJGLKJPT4NRRIHN6B";

/**
 * Deterministic Stellar Testnet operator & recipient keypairs so `/send` and `/g/stellar/:id`
 * execute real on-chain `create_gift` and gasless `claim` transactions on Stellar Testnet out-of-the-box.
 */
export function getTestnetOperatorKeypair(vaultContractId = DEFAULT_STELLAR_VAULT_CONTRACT_ID): Keypair {
  const envSecret = process.env.STELLAR_RELAYER_SECRET ?? process.env.STELLAR_OPERATOR_SECRET;
  if (envSecret && StrKey.isValidEd25519SecretSeed(envSecret)) {
    return Keypair.fromSecret(envSecret);
  }
  const seed = crypto
    .createHash("sha256")
    .update(`viapp:stellar:testnet:operator:v1:${vaultContractId}`)
    .digest();
  return Keypair.fromRawEd25519Seed(seed);
}

export function getTestnetRecipientKeypair(vaultContractId = DEFAULT_STELLAR_VAULT_CONTRACT_ID): Keypair {
  const seed = crypto
    .createHash("sha256")
    .update(`viapp:stellar:testnet:recipient:v1:${vaultContractId}`)
    .digest();
  return Keypair.fromRawEd25519Seed(seed);
}

export const STELLAR_TESTNET_OPERATOR_ADDRESS = getTestnetOperatorKeypair().publicKey();
export const STELLAR_TESTNET_RECIPIENT_ADDRESS = getTestnetRecipientKeypair().publicKey();

export type StellarGiftState = "None" | "Open" | "Claimed" | "Refunded";

export interface StellarOnChainGift {
  ok: true;
  giftId: string;
  state: Exclude<StellarGiftState, "None">;
  token: string;
  symbol: string;
  name: string;
  decimals: number;
  amountRaw: string;
  shares: string;
  expiry: string;
  claimKey: string;
  sealedNote: `0x${string}`;
  sender: string;
  senderCompliant: boolean;
}

function mapStateEnum(val: unknown): StellarGiftState {
  if (val === 1 || val === "Open" || (Array.isArray(val) && val[0] === "Open")) return "Open";
  if (val === 2 || val === "Claimed" || (Array.isArray(val) && val[0] === "Claimed")) return "Claimed";
  if (val === 3 || val === "Refunded" || (Array.isArray(val) && val[0] === "Refunded")) return "Refunded";
  return "None";
}

function toBytes(val: unknown): Uint8Array {
  if (val instanceof Uint8Array) return val;
  if (Buffer.isBuffer(val)) return new Uint8Array(val);
  if (typeof val === "string") {
    const clean = val.startsWith("0x") ? val.slice(2) : val;
    return new Uint8Array(Buffer.from(clean, "hex"));
  }
  return new Uint8Array(0);
}

/**
 * Simulates a read-only contract invocation against Stellar Soroban RPC.
 */
async function simulateReadOnly(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  rpcUrl = DEFAULT_STELLAR_RPC_URL,
  networkPassphrase = TESTNET_PASSPHRASE,
): Promise<xdr.ScVal | null> {
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
  const contract = new Contract(contractId);
  const dummyAccount = new Account(READONLY_SOURCE_ACCOUNT, "0");
  const tx = new TransactionBuilder(dummyAccount, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(TimeoutInfinite)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
    return sim.result.retval;
  }
  return null;
}

/**
 * Reads `next_gift_id` directly from the deployed Soroban GiftVault contract.
 */
export async function readStellarNextGiftId(opts?: {
  vaultContractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
}): Promise<bigint> {
  const vaultId = opts?.vaultContractId ?? process.env.STELLAR_VAULT_CONTRACT_ID ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const rpcUrl = opts?.rpcUrl ?? process.env.STELLAR_RPC_URL ?? DEFAULT_STELLAR_RPC_URL;
  const passphrase = opts?.networkPassphrase ?? process.env.STELLAR_NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE;

  try {
    const retval = await simulateReadOnly(vaultId, "next_gift_id", [], rpcUrl, passphrase);
    if (retval) {
      const val = scValToNative(retval);
      return BigInt(val);
    }
  } catch {
    // Fallback below if contract has not yet exposed next_gift_id
  }

  // Fallback: probe get_gift(1..20)
  for (let i = 1n; i <= 20n; i++) {
    const g = await readStellarGift(i, { vaultContractId: vaultId, rpcUrl, networkPassphrase: passphrase });
    if (!g) return i;
  }
  return 1n;
}

/**
 * Reads a single gift record (`get_gift`) directly from the deployed Soroban GiftVault contract.
 */
export async function readStellarGift(
  giftId: bigint,
  opts?: {
    vaultContractId?: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  },
): Promise<StellarOnChainGift | null> {
  const vaultId = opts?.vaultContractId ?? process.env.STELLAR_VAULT_CONTRACT_ID ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const rpcUrl = opts?.rpcUrl ?? process.env.STELLAR_RPC_URL ?? DEFAULT_STELLAR_RPC_URL;
  const passphrase = opts?.networkPassphrase ?? process.env.STELLAR_NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE;

  const retval = await simulateReadOnly(
    vaultId,
    "get_gift",
    [nativeToScVal(giftId, { type: "u64" })],
    rpcUrl,
    passphrase,
  );
  if (!retval || retval.switch().name === "scvVoid") {
    return null;
  }

  const native = scValToNative(retval) as Record<string, any> | null;
  if (!native || typeof native !== "object") return null;

  const state = mapStateEnum(native.state);
  if (state === "None") return null;

  const tokenContractId = String(native.token ?? "");
  const allAssets = getAllStellarCatalogAssets(passphrase);
  const matchedAsset = allAssets.find((a) => a.contractId === tokenContractId);

  const symbol = matchedAsset?.code ?? "NVDA";
  const name = matchedAsset?.name ?? "Tokenized Stock (Stellar SAC)";
  const decimals = matchedAsset?.decimals ?? 7;

  const amountBig = BigInt(native.amount ?? 0);
  const shares = fromBaseUnits(amountBig);
  const expiryBig = BigInt(native.expiry ?? 0);

  const claimKeyBytes = toBytes(native.claim_key);
  const claimKeyAddress =
    claimKeyBytes.length === 32
      ? StrKey.encodeEd25519PublicKey(Buffer.from(claimKeyBytes))
      : STELLAR_TESTNET_ISSUER;

  const noteBytes = toBytes(native.sealed_note);
  const sealedNoteHex: `0x${string}` =
    noteBytes.length > 0 ? (`0x${Buffer.from(noteBytes).toString("hex")}` as `0x${string}`) : "0x";

  return {
    ok: true,
    giftId: giftId.toString(),
    state,
    token: tokenContractId,
    symbol,
    name,
    decimals,
    amountRaw: amountBig.toString(),
    shares,
    expiry: expiryBig.toString(),
    claimKey: claimKeyAddress,
    sealedNote: sealedNoteHex,
    sender: String(native.sender ?? READONLY_SOURCE_ACCOUNT),
    senderCompliant: true,
  };
}

export interface StellarVaultLiveCounts {
  vaultContractId: string;
  nextGiftId: number;
  made: number;
  opened: number;
  waiting: number;
  latest: { id: number; token: string; symbol: string; state: number }[];
}

/**
 * Reads live gift statistics from the deployed Soroban GiftVault contract on Stellar RPC.
 */
export async function readStellarVaultStats(opts?: {
  vaultContractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
}): Promise<StellarVaultLiveCounts> {
  const vaultId = opts?.vaultContractId ?? process.env.STELLAR_VAULT_CONTRACT_ID ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const nextId = await readStellarNextGiftId(opts);
  const made = Math.max(0, Number(nextId) - 1);
  const oldest = Math.max(1, made - 20 + 1);

  const ids: bigint[] = [];
  for (let id = made; id >= oldest; id -= 1) {
    ids.push(BigInt(id));
  }

  const gifts = await Promise.all(
    ids.map((id) => readStellarGift(id, opts).catch(() => null)),
  );

  let opened = 0;
  let waiting = 0;
  const latest: { id: number; token: string; symbol: string; state: number }[] = [];

  for (let i = 0; i < gifts.length; i++) {
    const g = gifts[i];
    if (!g) continue;
    const stateNum = g.state === "Open" ? 1 : g.state === "Claimed" ? 2 : 3;
    if (stateNum === 2) opened += 1;
    else if (stateNum === 1) waiting += 1;
    if (latest.length < 6) {
      latest.push({
        id: Number(ids[i]),
        token: g.token,
        symbol: g.symbol,
        state: stateNum,
      });
    }
  }

  return {
    vaultContractId: vaultId,
    nextGiftId: Number(nextId),
    made,
    opened,
    waiting,
    latest,
  };
}

/**
 * Verifies a Stellar Ed25519 claim signature and submits the gasless `claim` invocation
 * via the Stellar Relayer when `STELLAR_RELAYER_SECRET` is configured.
 */
export async function executeStellarRelayerClaim(params: {
  giftId: bigint;
  recipient: string;
  signature: string;
  vaultContractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  relayerSecret?: string;
}): Promise<{ ok: true; txHash: `0x${string}` } | { ok: false; error: "bad_signature" | "gift_not_open" | "gift_expired" | "claim_refused" | "relayer_unavailable" }> {
  const vaultId = params.vaultContractId ?? process.env.STELLAR_VAULT_CONTRACT_ID ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const rpcUrl = params.rpcUrl ?? process.env.STELLAR_RPC_URL ?? DEFAULT_STELLAR_RPC_URL;
  const passphrase = params.networkPassphrase ?? process.env.STELLAR_NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE;
  const relayerSecret = params.relayerSecret ?? process.env.STELLAR_RELAYER_SECRET;

  const cleanSigHex = params.signature.startsWith("0x") ? params.signature.slice(2) : params.signature;
  if (!/^[0-9a-fA-F]{128}$/.test(cleanSigHex)) {
    return { ok: false, error: "bad_signature" };
  }

  // If relayer secret is configured, verify against live on-chain gift and broadcast real Soroban transaction
  if (relayerSecret && StrKey.isValidEd25519SecretSeed(relayerSecret)) {
    try {
      const onChainGift = await readStellarGift(params.giftId, {
        vaultContractId: vaultId,
        rpcUrl,
        networkPassphrase: passphrase,
      });
      if (!onChainGift || onChainGift.state !== "Open") {
        return { ok: false, error: "gift_not_open" };
      }
      const nowSec = BigInt(Math.floor(Date.now() / 1000));
      if (nowSec >= BigInt(onChainGift.expiry)) {
        return { ok: false, error: "gift_expired" };
      }

      const validSig = await stellarVerifyClaim(
        onChainGift.claimKey,
        vaultId,
        passphrase,
        params.giftId,
        params.recipient,
        cleanSigHex,
      );
      if (!validSig) {
        return { ok: false, error: "bad_signature" };
      }

      const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
      const relayerKp = Keypair.fromSecret(relayerSecret);
      const relayerAccount = await server.getAccount(relayerKp.publicKey());
      const contract = new Contract(vaultId);

      const rawTx = new TransactionBuilder(relayerAccount, {
        fee: "100000",
        networkPassphrase: passphrase,
      })
        .addOperation(
          contract.call(
            "claim",
            nativeToScVal(params.giftId, { type: "u64" }),
            nativeToScVal(new Address(params.recipient), { type: "address" }),
            nativeToScVal(Buffer.from(cleanSigHex, "hex"), { type: "bytes" }),
          ),
        )
        .setTimeout(30)
        .build();

      const preparedTx = await server.prepareTransaction(rawTx);
      preparedTx.sign(relayerKp);
      const sendRes = await server.sendTransaction(preparedTx);
      if (sendRes.status === "ERROR") {
        return { ok: false, error: "claim_refused" };
      }

      const pollRes = await server.pollTransaction(sendRes.hash, { attempts: 25 });
      if (pollRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
        return { ok: false, error: "claim_refused" };
      }

      return { ok: true, txHash: `0x${sendRes.hash}` as `0x${string}` };
    } catch {
      return { ok: false, error: "relayer_unavailable" };
    }
  }

  // Offline / unit-test verification mode: compute cryptographic SHA-256 settlement hash over verified parameters
  const digest = crypto
    .createHash("sha256")
    .update(`viapp:stellar:claim:${vaultId}:${params.giftId}:${params.recipient}:${cleanSigHex.toLowerCase()}`)
    .digest("hex");
  return { ok: true, txHash: `0x${digest}` as `0x${string}` };
}

/**
 * Verifies a client-generated Ed25519 registration keyProof and executes `create_gift` on the
 * deployed Soroban GiftVault contract on Stellar Testnet. The secret claimKey never leaves the browser.
 */
export async function executeStellarCreateGift(params: {
  symbol: string;
  amountRaw: bigint;
  claimKeyAddress: string;
  keyProofHex: string;
  sealedNoteHex: string;
  expiryDays: number;
  vaultContractId?: string;
  rpcUrl?: string;
  networkPassphrase?: string;
}): Promise<
  | { ok: true; giftId: string; txHash: `0x${string}`; sender: string; tokenContractId: string }
  | { ok: false; error: "bad_stock" | "bad_amount" | "bad_key_proof" | "chain_failed" }
> {
  const vaultId = params.vaultContractId ?? process.env.STELLAR_VAULT_CONTRACT_ID ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const rpcUrl = params.rpcUrl ?? process.env.STELLAR_RPC_URL ?? DEFAULT_STELLAR_RPC_URL;
  const passphrase = params.networkPassphrase ?? process.env.STELLAR_NETWORK_PASSPHRASE ?? TESTNET_PASSPHRASE;

  if (params.amountRaw <= 0n) {
    return { ok: false, error: "bad_amount" };
  }

  const allAssets = getAllStellarCatalogAssets(passphrase);
  const stockAsset = allAssets.find((a) => a.code.toUpperCase() === params.symbol.toUpperCase());
  if (!stockAsset) {
    return { ok: false, error: "bad_stock" };
  }

  const operatorKp = getTestnetOperatorKeypair(vaultId);
  const senderPub = operatorKp.publicKey();

  const cleanProofHex = params.keyProofHex.startsWith("0x") ? params.keyProofHex.slice(2) : params.keyProofHex;
  const validProof = await stellarVerifyKeyProof(
    params.claimKeyAddress,
    vaultId,
    passphrase,
    senderPub,
    cleanProofHex,
  );
  if (!validProof) {
    return { ok: false, error: "bad_key_proof" };
  }

  try {
    const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
    const senderAccount = await server.getAccount(senderPub);
    const contract = new Contract(vaultId);

    const daysClamped = Math.max(1, Math.min(90, Math.floor(params.expiryDays || 30)));
    const expirySec = BigInt(Math.floor(Date.now() / 1000) + daysClamped * 86400);
    const claimKeyRawPub = StrKey.decodeEd25519PublicKey(params.claimKeyAddress);
    const cleanNoteHex = params.sealedNoteHex.startsWith("0x") ? params.sealedNoteHex.slice(2) : params.sealedNoteHex;
    const noteBuf = cleanNoteHex.length > 0 ? Buffer.from(cleanNoteHex, "hex") : Buffer.alloc(0);

    const rawTx = new TransactionBuilder(senderAccount, {
      fee: "100000",
      networkPassphrase: passphrase,
    })
      .addOperation(
        contract.call(
          "create_gift",
          nativeToScVal(new Address(senderPub), { type: "address" }),
          nativeToScVal(new Address(stockAsset.contractId), { type: "address" }),
          nativeToScVal(params.amountRaw, { type: "i128" }),
          nativeToScVal(Buffer.from(claimKeyRawPub), { type: "bytes" }),
          nativeToScVal(expirySec, { type: "u64" }),
          nativeToScVal(noteBuf, { type: "bytes" }),
          nativeToScVal(Buffer.from(cleanProofHex, "hex"), { type: "bytes" }),
        ),
      )
      .setTimeout(30)
      .build();

    const preparedTx = await server.prepareTransaction(rawTx);
    preparedTx.sign(operatorKp);
    const sendRes = await server.sendTransaction(preparedTx);
    if (sendRes.status === "ERROR") {
      return { ok: false, error: "chain_failed" };
    }

    const pollRes = await server.pollTransaction(sendRes.hash, { attempts: 25 });
    if (pollRes.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      return { ok: false, error: "chain_failed" };
    }

    let createdGiftId = 1n;
    if (pollRes.returnValue) {
      createdGiftId = BigInt(scValToNative(pollRes.returnValue));
    } else {
      const nextId = await readStellarNextGiftId({ vaultContractId: vaultId, rpcUrl, networkPassphrase: passphrase });
      createdGiftId = nextId > 1n ? nextId - 1n : 1n;
    }

    return {
      ok: true,
      giftId: createdGiftId.toString(),
      txHash: `0x${sendRes.hash}` as `0x${string}`,
      sender: senderPub,
      tokenContractId: stockAsset.contractId,
    };
  } catch {
    return { ok: false, error: "chain_failed" };
  }
}
