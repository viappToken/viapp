import {
  Account,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  StrKey,
  TimeoutInfinite,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { DEFAULT_STELLAR_VAULT_CONTRACT_ID } from "@viapp/core/src/client/stellar.js";
import { DEFAULT_STELLAR_RPC_URL } from "@viapp/core/src/stellar-rpc.js";
import { TESTNET_PASSPHRASE } from "@viapp/core/src/trade-stellar.js";

export const DEFAULT_INSTANCE_TTL_THRESHOLD_LEDGERS = 7 * 86400 / 5;
export const DEFAULT_OPEN_GIFT_TTL_THRESHOLD_LEDGERS = 30 * 86400 / 5;

const READONLY_SOURCE_ACCOUNT = "GAZWESWQPZOIH2EH3IL37THBLKGLAC5FCHTLMWAXJGLKJPT4NRRIHN6B";
const LEDGER_ENTRY_BATCH_SIZE = 100;

export interface TtlServer {
  simulateTransaction(transaction: Parameters<rpc.Server["simulateTransaction"]>[0]): Promise<rpc.Api.SimulateTransactionResponse>;
  getLedgerEntries(...keys: xdr.LedgerKey[]): Promise<rpc.Api.GetLedgerEntriesResponse>;
  getAccount(accountId: string): Promise<Account>;
  prepareTransaction(transaction: Parameters<rpc.Server["prepareTransaction"]>[0]): ReturnType<rpc.Server["prepareTransaction"]>;
  sendTransaction(transaction: Parameters<rpc.Server["sendTransaction"]>[0]): Promise<rpc.Api.SendTransactionResponse>;
  pollTransaction(hash: string): ReturnType<rpc.Server["pollTransaction"]>;
}

export interface TtlEntryStatus {
  liveUntilLedger: number | null;
  remainingLedgers: number | null;
  thresholdLedgers: number;
  belowThreshold: boolean;
}

export interface OpenGiftTtlStatus extends TtlEntryStatus {
  giftId: string;
  state: "Open";
}

export interface VaultTtlReport {
  vaultContractId: string;
  latestLedger: number;
  nextGiftId: string;
  instance: TtlEntryStatus;
  openGifts: OpenGiftTtlStatus[];
  giftsNeedingExtension: number;
  needsBump: boolean;
}

export class TtlMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtlMaintenanceError";
  }
}

export function createTtlServer(rpcUrl = DEFAULT_STELLAR_RPC_URL): rpc.Server {
  return new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });
}

function contractDataKey(vaultContractId: string, storageKey: xdr.ScVal): xdr.LedgerKey {
  const contract = new Contract(vaultContractId).address().toScAddress();
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract,
      key: storageKey,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

function instanceLedgerKey(vaultContractId: string): xdr.LedgerKey {
  return contractDataKey(vaultContractId, xdr.ScVal.scvLedgerKeyContractInstance());
}

function giftLedgerKey(vaultContractId: string, giftId: bigint): xdr.LedgerKey {
  return contractDataKey(
    vaultContractId,
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Gift"), nativeToScVal(giftId, { type: "u64" })]),
  );
}

function status(liveUntilLedger: number | undefined, latestLedger: number, thresholdLedgers: number): TtlEntryStatus {
  if (liveUntilLedger === undefined) {
    return { liveUntilLedger: null, remainingLedgers: null, thresholdLedgers, belowThreshold: true };
  }
  const remainingLedgers = liveUntilLedger - latestLedger;
  return {
    liveUntilLedger,
    remainingLedgers,
    thresholdLedgers,
    belowThreshold: remainingLedgers <= thresholdLedgers,
  };
}

async function readNextGiftId(server: TtlServer, vaultContractId: string, networkPassphrase: string): Promise<bigint> {
  const source = new Account(READONLY_SOURCE_ACCOUNT, "0");
  const transaction = new TransactionBuilder(source, { fee: "100", networkPassphrase })
    .addOperation(new Contract(vaultContractId).call("next_gift_id"))
    .setTimeout(TimeoutInfinite)
    .build();
  const simulation = await server.simulateTransaction(transaction);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result?.retval) {
    throw new TtlMaintenanceError("Could not simulate GiftVault.next_gift_id; no maintenance decision was made.");
  }
  return BigInt(scValToNative(simulation.result.retval));
}

function readOpenState(entry: rpc.Api.LedgerEntryResult): boolean {
  if (entry.val.switch().name !== "contractData") return false;
  const native = scValToNative(entry.val.contractData().val());
  if (!native || typeof native !== "object" || Array.isArray(native)) return false;
  const state = (native as Record<string, unknown>).state;
  return state === 1 || state === 1n || state === "Open" || (Array.isArray(state) && state[0] === "Open");
}

/** Reads the vault instance plus every open gift's remaining Soroban ledger TTL in batched RPC calls. */
export async function monitorVaultTtl(options: {
  server: TtlServer;
  vaultContractId?: string;
  networkPassphrase?: string;
  instanceThresholdLedgers?: number;
  giftThresholdLedgers?: number;
}): Promise<VaultTtlReport> {
  const vaultContractId = options.vaultContractId ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID;
  const networkPassphrase = options.networkPassphrase ?? TESTNET_PASSPHRASE;
  const instanceThreshold = options.instanceThresholdLedgers ?? DEFAULT_INSTANCE_TTL_THRESHOLD_LEDGERS;
  const giftThreshold = options.giftThresholdLedgers ?? DEFAULT_OPEN_GIFT_TTL_THRESHOLD_LEDGERS;
  if (!Number.isInteger(instanceThreshold) || instanceThreshold < 0) {
    throw new TtlMaintenanceError("The instance TTL threshold must be a non-negative whole number of ledgers.");
  }
  if (!Number.isInteger(giftThreshold) || giftThreshold < 0) {
    throw new TtlMaintenanceError("The open-gift TTL threshold must be a non-negative whole number of ledgers.");
  }

  const nextGiftId = await readNextGiftId(options.server, vaultContractId, networkPassphrase);
  const gifts = new Map<string, bigint>();
  for (let id = 1n; id < nextGiftId; id += 1n) {
    gifts.set(giftLedgerKey(vaultContractId, id).toXDR("base64"), id);
  }

  const instanceLedgerEntryKey = instanceLedgerKey(vaultContractId);
  const giftLedgerEntries = [...gifts].map(([encoded, giftId]) => ({
    key: xdr.LedgerKey.fromXDR(encoded, "base64"),
    giftId,
  }));
  const keys = [instanceLedgerEntryKey, ...giftLedgerEntries.map(({ key }) => key)];
  const entries = new Map<string, rpc.Api.LedgerEntryResult>();
  let latestLedger = 0;
  for (let start = 0; start < keys.length; start += LEDGER_ENTRY_BATCH_SIZE) {
    const response = await options.server.getLedgerEntries(...keys.slice(start, start + LEDGER_ENTRY_BATCH_SIZE));
    latestLedger = Math.max(latestLedger, response.latestLedger);
    for (const entry of response.entries) entries.set(entry.key.toXDR("base64"), entry);
  }

  const instanceEntry = entries.get(keys[0]!.toXDR("base64"));
  if (!instanceEntry) {
    throw new TtlMaintenanceError("The GiftVault instance ledger entry was not found; refusing to submit a TTL bump.");
  }
  const instance = status(instanceEntry.liveUntilLedgerSeq, latestLedger, instanceThreshold);
  const openGifts: OpenGiftTtlStatus[] = [];
  for (const [encoded, giftId] of gifts) {
    const entry = entries.get(encoded);
    if (!entry || !readOpenState(entry)) continue;
    openGifts.push({ giftId: giftId.toString(), state: "Open", ...status(entry.liveUntilLedgerSeq, latestLedger, giftThreshold) });
  }
  openGifts.sort((a, b) => BigInt(a.giftId) < BigInt(b.giftId) ? -1 : BigInt(a.giftId) > BigInt(b.giftId) ? 1 : 0);

  return {
    vaultContractId,
    latestLedger,
    nextGiftId: nextGiftId.toString(),
    instance,
    openGifts,
    giftsNeedingExtension: openGifts.filter((gift) => gift.belowThreshold).length,
    needsBump: instance.belowThreshold,
  };
}

/** Builds the permissionless GiftVault.extend_ttl() invocation. */
export function buildExtendTtlTransaction(options: {
  sourceAccount: Account;
  vaultContractId?: string;
  networkPassphrase?: string;
  fee?: string;
}) {
  return new TransactionBuilder(options.sourceAccount, {
    fee: options.fee ?? "100000",
    networkPassphrase: options.networkPassphrase ?? TESTNET_PASSPHRASE,
  })
    .addOperation(new Contract(options.vaultContractId ?? DEFAULT_STELLAR_VAULT_CONTRACT_ID).call("extend_ttl"))
    .setTimeout(30)
    .build();
}

/** Prepares, signs, submits and confirms GiftVault.extend_ttl(). */
export async function bumpVaultTtl(options: {
  server: TtlServer;
  sourceSecret: string;
  vaultContractId?: string;
  networkPassphrase?: string;
}): Promise<{ txHash: string }> {
  if (!StrKey.isValidEd25519SecretSeed(options.sourceSecret)) {
    throw new TtlMaintenanceError("STELLAR_MAINTENANCE_SECRET is not a valid Stellar secret seed.");
  }
  const signer = Keypair.fromSecret(options.sourceSecret);
  const account = await options.server.getAccount(signer.publicKey());
  const built = buildExtendTtlTransaction({
    sourceAccount: account,
    vaultContractId: options.vaultContractId,
    networkPassphrase: options.networkPassphrase,
  });
  const prepared = await options.server.prepareTransaction(built);
  prepared.sign(signer);
  const sent = await options.server.sendTransaction(prepared);
  if (sent.status !== "PENDING" && sent.status !== "DUPLICATE") {
    throw new TtlMaintenanceError(`Stellar RPC did not accept the TTL bump (${sent.status}).`);
  }
  const final = await options.server.pollTransaction(sent.hash);
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new TtlMaintenanceError(`The TTL bump did not confirm (${final.status}).`);
  }
  return { txHash: sent.hash };
}
