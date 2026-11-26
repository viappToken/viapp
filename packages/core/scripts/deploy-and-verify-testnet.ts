import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  StrKey,
  TimeoutInfinite,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  newStellarClaimKey,
  sealNote,
  stellarSignClaim,
  stellarSignKeyProof,
} from "../src/gift.js";

const RPC_URL = "https://soroban-testnet.stellar.org";
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const WASM_HASH = "14e4c5a834f2bd49719a030108c7b9140c6cdeca89859a0f84e58ecc004127b5";
const MINT_TX_HASH = "fd96a64efd56f2005299ec92b90cfbfb7af8f21fd91fc5e091d1286374d4f39a";
const UPLOAD_WASM_TX_HASH = "9311be00c2f195ea2b669be8b4da07337da9e0c27a97173165bcb3a50467ff6d";

const STOCK_CODES = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ"] as const;
const XLM_SAC = Asset.native().contractId(PASSPHRASE);
const CIRCLE_TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const USDC_SAC = new Asset("USDC", CIRCLE_TESTNET_USDC_ISSUER).contractId(PASSPHRASE);

function getSecret(alias: string): string {
  return execSync(`stellar keys secret ${alias}`, { encoding: "utf-8" }).trim();
}

function runStellar(args: string[]): string {
  return execFileSync("stellar", args, { encoding: "utf-8" }).trim();
}

async function submitClassicTx(tx: any): Promise<string> {
  const res = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: tx.toXDR() }),
  });
  const data = (await res.json()) as any;
  if (!res.ok || !data.successful) {
    throw new Error(`Horizon tx failed: ${JSON.stringify(data.extras?.result_codes || data)}`);
  }
  return data.hash as string;
}

async function getHorizonAccount(pubKey: string): Promise<Account> {
  const res = await fetch(`${HORIZON_URL}/accounts/${pubKey}`);
  if (!res.ok) throw new Error(`Failed to fetch account ${pubKey}`);
  const data = (await res.json()) as any;
  return new Account(pubKey, data.sequence);
}

async function main() {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");

  const adminKp = Keypair.fromSecret(getSecret("test-eval"));
  const issuerKp = Keypair.fromSecret(getSecret("viapp-issuer"));
  const relayerKp = Keypair.fromSecret(getSecret("viapp-relayer"));

  console.log("=== ViApp Stellar Testnet Full Deployment & On-Chain Verification ===");
  console.log(`Admin / Sender: ${adminKp.publicKey()}`);
  console.log(`Stock Issuer:   ${issuerKp.publicKey()}`);
  console.log(`Relayer:        ${relayerKp.publicKey()}`);

  // 1. Create recipient account via Friendbot and establish trustline for NVDA & AAPL
  const recipientKp = Keypair.random();
  await fetch(`https://friendbot.stellar.org/?addr=${recipientKp.publicKey()}`);
  console.log(`Recipient:      ${recipientKp.publicKey()}`);

  const recipientAcc = await getHorizonAccount(recipientKp.publicKey());
  const trustTx = new TransactionBuilder(recipientAcc, {
    fee: "10000",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset("NVDA", issuerKp.publicKey()) }))
    .addOperation(Operation.changeTrust({ asset: new Asset("AAPL", issuerKp.publicKey()) }))
    .setTimeout(TimeoutInfinite)
    .build();
  trustTx.sign(recipientKp);
  await submitClassicTx(trustTx);

  // 2. Map the 9 deployed SAC contract IDs
  const sacMap: Record<string, string> = {};
  for (const code of STOCK_CODES) {
    const asset = new Asset(code, issuerKp.publicKey());
    sacMap[code] = asset.contractId(PASSPHRASE);
  }

  // 3. Deploy upgraded GiftVault contract with __constructor using execFileSync
  console.log("\n3. Deploying upgraded GiftVault contract with __constructor...");
  const initialTokens = [
    XLM_SAC,
    USDC_SAC,
    sacMap.AAPL!,
    sacMap.NVDA!,
    sacMap.TSLA!,
    sacMap.MSFT!,
    sacMap.AMZN!,
    sacMap.GOOGL!,
    sacMap.META!,
    sacMap.SPY!,
  ];

  const deployOut = runStellar([
    "contract",
    "deploy",
    "--wasm-hash",
    WASM_HASH,
    "--source-account",
    "test-eval",
    "--network",
    "testnet",
    "--",
    "--admin",
    adminKp.publicKey(),
    "--relayer",
    relayerKp.publicKey(),
    "--initial_tokens",
    JSON.stringify(initialTokens),
  ]);
  const vaultContractId = deployOut.split("\n").pop()!.trim();
  console.log(`   Deployed GiftVault Contract ID: ${vaultContractId}`);

  const adminTxsRes = await fetch(`${HORIZON_URL}/accounts/${adminKp.publicKey()}/transactions?order=desc&limit=1`);
  const adminTxs = (await adminTxsRes.json()) as any;
  const deployTxHash = adminTxs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   Deploy Tx Hash: ${deployTxHash}`);

  // 4. Dynamically whitelist QQQ via set_token_listed
  console.log("\n4. Invoking set_token_listed for QQQ SAC...");
  runStellar([
    "contract",
    "invoke",
    "--id",
    vaultContractId,
    "--source-account",
    "test-eval",
    "--network",
    "testnet",
    "--send=yes",
    "--",
    "set_token_listed",
    "--token",
    sacMap.QQQ!,
    "--listed",
    "true",
  ]);
  const listTxsRes = await fetch(`${HORIZON_URL}/accounts/${adminKp.publicKey()}/transactions?order=desc&limit=1`);
  const listTxs = (await listTxsRes.json()) as any;
  const setTokenListedTxHash = listTxs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   set_token_listed(QQQ, true) Tx Hash: ${setTokenListedTxHash}`);

  // 5. Create Gift #1 (1 share of NVDA SAC) and claim it via viapp-relayer
  console.log("\n5. Creating Gift #1 (NVDA tokenized stock) on GiftVault...");
  const claim1 = newStellarClaimKey();
  const claim1PubHex = Buffer.from(StrKey.decodeEd25519PublicKey(claim1.address)).toString("hex");
  const sealed1 = (await sealNote(claim1.privateKey, "Welcome to ViApp! Enjoy your first share of NVIDIA on Stellar.")).slice(2);
  const expiry1 = Math.floor(Date.now() / 1000) + 86400 * 30;
  const proof1Hex = await stellarSignKeyProof(
    claim1.privateKey,
    vaultContractId,
    PASSPHRASE,
    adminKp.publicKey(),
  );

  runStellar([
    "contract",
    "invoke",
    "--id",
    vaultContractId,
    "--source-account",
    "test-eval",
    "--network",
    "testnet",
    "--send=yes",
    "--",
    "create_gift",
    "--sender",
    adminKp.publicKey(),
    "--token",
    sacMap.NVDA!,
    "--amount",
    "10000000",
    "--claim_key",
    claim1PubHex,
    "--expiry",
    String(expiry1),
    "--sealed_note",
    sealed1,
    "--key_proof",
    proof1Hex,
  ]);
  const create1TxsRes = await fetch(`${HORIZON_URL}/accounts/${adminKp.publicKey()}/transactions?order=desc&limit=1`);
  const create1Txs = (await create1TxsRes.json()) as any;
  const createGift1TxHash = create1Txs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   Created Gift #1 (NVDA)! Tx Hash: ${createGift1TxHash}`);

  // 6. Claim Gift #1 via viapp-relayer
  console.log("\n6. Claiming Gift #1 (NVDA) gaslessly via viapp-relayer...");
  const claim1SigHex = await stellarSignClaim(
    claim1.privateKey,
    vaultContractId,
    PASSPHRASE,
    1n,
    recipientKp.publicKey(),
  );
  runStellar([
    "contract",
    "invoke",
    "--id",
    vaultContractId,
    "--source-account",
    "viapp-relayer",
    "--network",
    "testnet",
    "--send=yes",
    "--",
    "claim",
    "--gift_id",
    "1",
    "--recipient",
    recipientKp.publicKey(),
    "--signature",
    claim1SigHex,
  ]);
  const claim1TxsRes = await fetch(`${HORIZON_URL}/accounts/${relayerKp.publicKey()}/transactions?order=desc&limit=1`);
  const claim1Txs = (await claim1TxsRes.json()) as any;
  const claimGift1TxHash = claim1Txs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   Claimed Gift #1 (NVDA) via viapp-relayer! Tx Hash: ${claimGift1TxHash}`);

  // 7. Create Gift #2 (Open AAPL gift) & Gift #3 (Open NVDA gift) for live testers
  console.log("\n7. Creating Open Gift #2 (AAPL) and Gift #3 (NVDA) for live app state...");
  const claim2 = newStellarClaimKey();
  const claim2PubHex = Buffer.from(StrKey.decodeEd25519PublicKey(claim2.address)).toString("hex");
  const sealed2 = (await sealNote(claim2.privateKey, "Here is your Apple (AAPL) tokenized stock share on Stellar!")).slice(2);
  const proof2Hex = await stellarSignKeyProof(
    claim2.privateKey,
    vaultContractId,
    PASSPHRASE,
    adminKp.publicKey(),
  );
  runStellar([
    "contract",
    "invoke",
    "--id",
    vaultContractId,
    "--source-account",
    "test-eval",
    "--network",
    "testnet",
    "--send=yes",
    "--",
    "create_gift",
    "--sender",
    adminKp.publicKey(),
    "--token",
    sacMap.AAPL!,
    "--amount",
    "5000000",
    "--claim_key",
    claim2PubHex,
    "--expiry",
    String(expiry1),
    "--sealed_note",
    sealed2,
    "--key_proof",
    proof2Hex,
  ]);
  const create2TxsRes = await fetch(`${HORIZON_URL}/accounts/${adminKp.publicKey()}/transactions?order=desc&limit=1`);
  const create2Txs = (await create2TxsRes.json()) as any;
  const createGift2TxHash = create2Txs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   Created Open Gift #2 (AAPL)! Tx Hash: ${createGift2TxHash}`);

  const claim3 = newStellarClaimKey();
  const claim3PubHex = Buffer.from(StrKey.decodeEd25519PublicKey(claim3.address)).toString("hex");
  const sealed3 = (await sealNote(claim3.privateKey, "Welcome to Stellar tokenized stocks! Here is your NVIDIA share.")).slice(2);
  const proof3Hex = await stellarSignKeyProof(
    claim3.privateKey,
    vaultContractId,
    PASSPHRASE,
    adminKp.publicKey(),
  );
  runStellar([
    "contract",
    "invoke",
    "--id",
    vaultContractId,
    "--source-account",
    "test-eval",
    "--network",
    "testnet",
    "--send=yes",
    "--",
    "create_gift",
    "--sender",
    adminKp.publicKey(),
    "--token",
    sacMap.NVDA!,
    "--amount",
    "7000000",
    "--claim_key",
    claim3PubHex,
    "--expiry",
    String(expiry1),
    "--sealed_note",
    sealed3,
    "--key_proof",
    proof3Hex,
  ]);
  const create3TxsRes = await fetch(`${HORIZON_URL}/accounts/${adminKp.publicKey()}/transactions?order=desc&limit=1`);
  const create3Txs = (await create3TxsRes.json()) as any;
  const createGift3TxHash = create3Txs._embedded?.records?.[0]?.hash ?? "";
  console.log(`   Created Open Gift #3 (NVDA)! Tx Hash: ${createGift3TxHash}`);

  // Save deployment manifest to .deployments/testnet.json
  const deploymentsDir = path.join(repoRoot, ".deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const manifest = {
    network: "testnet",
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC_URL,
    horizonUrl: HORIZON_URL,
    deployedAt: new Date().toISOString(),
    wasmHash: WASM_HASH,
    contracts: {
      giftVault: vaultContractId,
      xlmSac: XLM_SAC,
      usdcSac: USDC_SAC,
      stocks: sacMap,
    },
    accounts: {
      admin: adminKp.publicKey(),
      issuer: issuerKp.publicKey(),
      relayer: relayerKp.publicKey(),
      sampleRecipient: recipientKp.publicKey(),
    },
    transactions: {
      mintAndTrustlines: MINT_TX_HASH,
      uploadWasm: UPLOAD_WASM_TX_HASH,
      deployVault: deployTxHash,
      setTokenListedQqq: setTokenListedTxHash,
      createGift1Nvda: createGift1TxHash,
      claimGift1Nvda: claimGift1TxHash,
      createGift2Aapl: createGift2TxHash,
      createGift3Nvda: createGift3TxHash,
    },
    sampleOpenGifts: [
      {
        giftId: 2,
        stock: "AAPL",
        claimKeyPublic: claim2.address,
        claimSecretFragment: claim2.privateKey,
      },
      {
        giftId: 3,
        stock: "NVDA",
        claimKeyPublic: claim3.address,
        claimSecretFragment: claim3.privateKey,
      },
    ],
  };

  fs.writeFileSync(
    path.join(deploymentsDir, "testnet.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("\n=== Saved verified manifest to .deployments/testnet.json ===");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
