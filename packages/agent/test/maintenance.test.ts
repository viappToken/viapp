import { Account, Contract, Keypair, nativeToScVal, rpc, Transaction, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_STELLAR_VAULT_CONTRACT_ID } from "@viapp/core/src/client/stellar.js";
import { bumpVaultTtl, monitorVaultTtl, type TtlServer } from "../src/maintenance.js";

const LATEST = 1_000;

function ledgerKey(storageKey: xdr.ScVal): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Contract(DEFAULT_STELLAR_VAULT_CONTRACT_ID).address().toScAddress(),
      key: storageKey,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

function instanceKey(): xdr.LedgerKey {
  return ledgerKey(xdr.ScVal.scvLedgerKeyContractInstance());
}

function giftKey(id: number): xdr.LedgerKey {
  return ledgerKey(xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Gift"), nativeToScVal(BigInt(id), { type: "u64" })]));
}

function entry(key: xdr.LedgerKey, liveUntilLedgerSeq: number, giftState?: number): rpc.Api.LedgerEntryResult {
  const val = xdr.LedgerEntryData.contractData(
    new xdr.ContractDataEntry({
      ext: new xdr.ExtensionPoint(0),
      contract: new Contract(DEFAULT_STELLAR_VAULT_CONTRACT_ID).address().toScAddress(),
      key: giftState === undefined ? xdr.ScVal.scvLedgerKeyContractInstance() : key.contractData().key(),
      durability: xdr.ContractDataDurability.persistent(),
      val: giftState === undefined ? nativeToScVal({ executable: "instance" }) : nativeToScVal({ state: giftState }),
    }),
  );
  return { key, val, liveUntilLedgerSeq };
}

function simulation(nextGiftId: bigint): rpc.Api.SimulateTransactionResponse {
  return {
    id: "simulation-1",
    latestLedger: LATEST,
    transactionData: {},
    result: { auth: [], retval: nativeToScVal(nextGiftId, { type: "u64" }) },
    minResourceFee: "0",
    events: [],
    cost: { cpuInsns: "0", memBytes: "0" },
  } as unknown as rpc.Api.SimulateTransactionResponse;
}

function serverWith(entries: rpc.Api.LedgerEntryResult[], nextGiftId = 4n) {
  const getLedgerEntries = vi.fn(async (...keys: xdr.LedgerKey[]) => {
    const wanted = new Set(keys.map((key) => key.toXDR("base64")));
    return {
      latestLedger: LATEST,
      entries: entries.filter((item) => wanted.has(item.key.toXDR("base64"))),
    };
  });
  const server = {
    simulateTransaction: vi.fn(async () => simulation(nextGiftId)),
    getLedgerEntries,
  } as unknown as TtlServer;
  return { server, getLedgerEntries };
}

describe("GiftVault TTL monitoring", () => {
  it("reports the instance and only open gifts, with their remaining ledger TTL", async () => {
    const { server, getLedgerEntries } = serverWith([
      entry(instanceKey(), LATEST + 100),
      entry(giftKey(1), LATEST + 200, 1),
      entry(giftKey(2), LATEST + 900, 2),
      entry(giftKey(3), LATEST + 1_600, 1),
    ]);

    const report = await monitorVaultTtl({ server, instanceThresholdLedgers: 200, giftThresholdLedgers: 500 });

    expect(report).toMatchObject({
      latestLedger: LATEST,
      nextGiftId: "4",
      instance: { remainingLedgers: 100, thresholdLedgers: 200, belowThreshold: true },
      giftsNeedingExtension: 1,
      needsBump: true,
    });
    expect(report.openGifts).toEqual([
      { giftId: "1", state: "Open", liveUntilLedger: LATEST + 200, remainingLedgers: 200, thresholdLedgers: 500, belowThreshold: true },
      { giftId: "3", state: "Open", liveUntilLedger: LATEST + 1_600, remainingLedgers: 1_600, thresholdLedgers: 500, belowThreshold: false },
    ]);
    expect(getLedgerEntries).toHaveBeenCalledOnce();
    expect(getLedgerEntries.mock.calls[0]).toHaveLength(4);
  });

  it("does not request a bump while the instance TTL is healthy", async () => {
    const { server } = serverWith([entry(instanceKey(), LATEST + 5_000)], 1n);
    const report = await monitorVaultTtl({ server, instanceThresholdLedgers: 200, giftThresholdLedgers: 500 });
    expect(report.needsBump).toBe(false);
    expect(report.openGifts).toEqual([]);
  });

  it("refuses to make a decision when the vault instance entry is absent", async () => {
    const { server } = serverWith([], 1n);
    await expect(monitorVaultTtl({ server })).rejects.toThrow(/instance ledger entry was not found/);
  });
});

describe("GiftVault TTL bump", () => {
  it("prepares, signs, submits and verifies the permissionless extend_ttl call", async () => {
    const signer = Keypair.random();
    const account = new Account(signer.publicKey(), "1");
    const prepareTransaction = vi.fn(async (transaction: Transaction) => transaction);
    const sendTransaction = vi.fn(async (transaction: Transaction) => {
      expect(transaction.operations[0]?.type).toBe("invokeHostFunction");
      expect(transaction.signatures.length).toBe(1);
      return { status: "PENDING", hash: "deadbeef" } as rpc.Api.SendTransactionResponse;
    });
    const pollTransaction = vi.fn(async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS }));
    const server = {
      getAccount: vi.fn(async () => account),
      prepareTransaction,
      sendTransaction,
      pollTransaction,
    } as unknown as TtlServer;

    await expect(bumpVaultTtl({ server, sourceSecret: signer.secret() })).resolves.toEqual({ txHash: "deadbeef" });
    expect(prepareTransaction).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledOnce();
    expect(pollTransaction).toHaveBeenCalledWith("deadbeef");
  });

  it("rejects a malformed signer before making an RPC call", async () => {
    const getAccount = vi.fn();
    const server = { getAccount } as unknown as TtlServer;
    await expect(bumpVaultTtl({ server, sourceSecret: "not-a-secret" })).rejects.toThrow(/valid Stellar secret seed/);
    expect(getAccount).not.toHaveBeenCalled();
  });
});
