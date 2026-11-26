# Stellar Community Fund (SCF Build) Proposal: ViApp

**Project:** ViApp — Tokenized Stocks & Cryptographic Link Gift Vault on Stellar  
**Repository:** [https://github.com/viappToken/viapp](https://github.com/viappToken/viapp)  
**Track:** SCF Open / Integration Track (4-Month Path to Mainnet)  
**Current State:** Live Stellar Testnet MVP ([`CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4`](https://stellar.expert/explorer/testnet/contract/CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4))  

---

## 1. Executive Summary & Ecosystem Value

**ViApp** is an open-source social onboarding and fractional asset-gifting protocol built on **Stellar Smart Contracts (Soroban)** and **SEP-0041 Stellar Asset Contracts (SACs)**. It lets a user lock fractional shares of tokenized equities or regulated Stellar RWAs inside an non-custodial escrow contract (`viapp-gift-vault`) and share the claim right as a URL (`https://<domain>/g/stellar/<giftId>#<claimSecret>`).

- **Zero Server-Side Key Custody:** The Ed25519 claim seed resides exclusively in the URL `#` fragment (RFC 3986), never reaching HTTP servers. Both gift registration (`create_gift`) and redemption (`claim`) verify domain-separated SHA-256 + Ed25519 signatures on-chain via `env.crypto().ed25519_verify()`.
- **Gasless Recipient Onboarding:** The recipient does not need pre-funded XLM. ViApp's relayer sponsors the claim transaction fee, while the on-chain Ed25519 signature binds the exact `recipient` address so a compromised relayer can never redirect funds.
- **Unpausable Sender Safety:** Even if the admin pauses new gift creation, `refund(gift_id)` is strictly unpausable after expiry, and `rescue_surplus()` is mathematically bounded by per-token `DataKey::Liabilities(token)`.

---

## 2. Technical Architecture Blueprint

### 2.1 Smart Contract Storage & TTL Model (`packages/contracts/stellar/src/lib.rs`)
- **`instance()` Storage (Bounded Global Config < 1 KB):**
  - `DataKey::Admin` (`Address`), `DataKey::Relayer` (`Address`), `DataKey::NextGiftId` (`u64`), `DataKey::IsPaused` (`bool`).
  - Initialized atomically at deployment via CAP-0058 `pub fn __constructor(env: Env, admin: Address, relayer: Address, initial_tokens: Vec<Address>)`.
  - Proactively bumped (`INSTANCE_LIFETIME_THRESHOLD = 7d`, `INSTANCE_BUMP_AMOUNT = 30d`) on every state mutation.
- **`persistent()` Storage (Fine-Grained Per-Gift & Per-Token Keys for CAP-0063 Parallel Execution):**
  - `DataKey::Gift(u64)` → `Gift { token, sender, claim_key, amount, expiry, state, sealed_note }`
  - `DataKey::ClaimKeyUsed(BytesN<32>)` → `bool` (one-time Ed25519 public key replay guard)
  - `DataKey::Liabilities(Address)` → `i128` (exact open-gift liability accounting per SAC token)
  - `DataKey::IsListed(Address)` → `bool` & `DataKey::ListedTokens` → `Vec<Address>` (capped at `MAX_TOKENS = 32`)
  - Every persistent key is extended via `extend_ttl(30d, 95d)` on creation and mutation, exceeding `MAX_LIFETIME = 90d`.

### 2.2 Deployed Testnet SAC Registry (`.deployments/testnet.json`)
| Symbol | Deployed Testnet SAC Contract ID | Classic Asset Identifier |
|:---:|---|---|
| **AAPL** | `CBUEWQFAQJUMIU7PU6U64Q35NCGF752BB7JHYKMEUZ6OA7767S66EYJB` | `AAPL:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **NVDA** | `CAX6GMJ7R4SKDEPHDFPJJMGYXNBWNFUOLDZZIQUV3PMRIMDRGUEY3RZV` | `NVDA:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **TSLA** | `CCX7WIJYXP2HXPMKKAOLYSMTVTLFYZDRBC5OR3O4S2QGBGUWN5NZQUVU` | `TSLA:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **MSFT** | `CA566SBZVF5XPOHA5IBIDNSKJ7OBD5UT7V5LZZUSSQCXJ3BQ7RXNMVAU` | `MSFT:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **AMZN** | `CCSCABC5NOE7VSZY7FJOOQOGVIHIHCXW2G5ETERS3J2CPAMF3DKFLAOL` | `AMZN:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **GOOGL**| `CDLGAWB22W2PSU6UBTIC2O2XOX7AXQQXEM6V4TGIZWW6OH6VA6NAHXJD` | `GOOGL:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **META** | `CABP7JTR5F7VAX73NIWFAMJVN3HDAOG6TALS62UEUQHY3ZSJ3T23VKWC` | `META:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **SPY**  | `CCD3SEF2BGN4FSSQLXACT2V2I7QWVA2HW54HJCWJMKHKJ7ZYSXXCSH5Z` | `SPY:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |
| **QQQ**  | `CCON7JI5MMA2A55E4K6VCAVQV4GXP37BLPBRIKENFPSSP33ADTF7C7Q7` | `QQQ:GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN` |

---

## 3. 4-Month Technical Milestone Plan & Itemized Engineering Budget ($60,000 Ask)

> **Budget Compliance Note:** 100% of requested funds are allocated strictly to smart contract engineering, security verification, protocol integration, and mainnet deployment deliverables. Zero funds are allocated to marketing, token airdrops, or non-build overhead.

| Tranche / Milestone | Concrete Technical Deliverables | Verification Criteria | Timeline | Budget |
|---|---|---|:---:|:---:|
| **Tranche 1: Security Hardening, Fuzzing & SEP-0040 Oracle Integration** | 1. Integrate SEP-0040 Reflector Oracle price feed & staleness guard into `viapp-gift-vault`.<br>2. Add `cargo-fuzz` + `proptest` suites and run CoinFabrik Scout (`cargo scout-audit`) with 0 critical/high findings.<br>3. Implement batch gift creation (`create_gift_batch`) for payroll/corporate disbursements. | Public GitHub release, CI green on `cargo scout-audit` & fuzz targets, Testnet contract upgrade verified on StellarExpert. | Month 1–2 | **$20,000** |
| **Tranche 2: Passkey Smart Accounts (`smart-account-kit`) & OpenZeppelin Relayer Channels** | 1. Integrate `smart-account-kit` (`secp256r1` WebAuthn passkeys + CAP-0071 delegated signers) for 1-tap recipient wallet creation.<br>2. Wire OpenZeppelin Relayer (`@openzeppelin/relayer-plugin-channels`) for production fee-sponsored claiming.<br>3. Complete Soroban Audit Bank readiness package (`SECURITY.md` + threat model). | Working passkey claim flow on Testnet + hosted staging URL + clean pre-audit security report. | Month 3 | **$20,000** |
| **Tranche 3: Mainnet Launch, SEP-0056 / RWA Composability & On-Chain KPIs** | 1. Deploy SEP-0055 verified `viapp-gift-vault` build to **Stellar Mainnet** (`.deployments/mainnet.json`).<br>2. Enable gifting of Mainnet USDC (`CCW67...JMI75`), regulated SEP-0008 RWAs, and SEP-0056 DeFindex vault shares.<br>3. Achieve ratified Mainnet on-chain KPI targets. | Verified Mainnet contract ID on StellarExpert + **≥ 1,000 Mainnet gift/claim transactions** and **≥ $25,000 cumulative Mainnet gift volume / TVL**. | Month 4 | **$20,000** |
| **Total** | **End-to-End Mainnet GiftVault Protocol on Stellar** | **All 3 Tranches Verified On-Chain** | **4 Months** | **$60,000** |
