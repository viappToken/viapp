# ViApp Protocol: Stellar Testnet Execution & Verification Results

**Contract ID:** [`CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4`](https://stellar.expert/explorer/testnet/contract/CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4)  
**WASM Hash (`wasm32v1-none`, 13,062 bytes):** `14e4c5a834f2bd49719a030108c7b9140c6cdeca89859a0f84e58ecc004127b5`  
**Network:** Stellar Testnet (`Test SDF Network ; September 2015`)  
**Soroban RPC:** `https://soroban-testnet.stellar.org`  
**Horizon REST:** `https://horizon-testnet.stellar.org`  
**Deployment Manifest:** [`.deployments/testnet.json`](../.deployments/testnet.json)  

---

## 1. Executive Summary & Live On-Chain Verification Matrix

Every transaction, contract state transition, and cryptographic proof below was executed on the public **Stellar Testnet** and is independently verifiable via Horizon, Soroban RPC, or StellarExpert:

| Action / Capability | On-Chain Function | Stellar Testnet Tx Hash | Explorer Link | Result |
|---|---|---|:---:|:---:|
| **1. Mint & Trustlines (9 Stocks)** | Classic `changeTrust` + `payment` | `fd96a64efd56f2005299ec92b90cfbfb7af8f21fd91fc5e091d1286374d4f39a` | [View Tx](https://stellar.expert/explorer/testnet/tx/fd96a64efd56f2005299ec92b90cfbfb7af8f21fd91fc5e091d1286374d4f39a) | **SUCCESS** |
| **2. Upload Optimized WASM** | `stellar contract upload` | `9311be00c2f195ea2b669be8b4da07337da9e0c27a97173165bcb3a50467ff6d` | [View Tx](https://stellar.expert/explorer/testnet/tx/9311be00c2f195ea2b669be8b4da07337da9e0c27a97173165bcb3a50467ff6d) | **SUCCESS** |
| **3. Deploy & Init GiftVault** | `__constructor(admin, relayer, initial_tokens)` | `91a51bd598a3f77e3ca50cd0ba5cd96c8b23d53e6174cb444137ab88761e85d2` | [View Tx](https://stellar.expert/explorer/testnet/tx/91a51bd598a3f77e3ca50cd0ba5cd96c8b23d53e6174cb444137ab88761e85d2) | **SUCCESS** |
| **4. Whitelist Token (QQQ SAC)** | `set_token_listed(token, true)` | `a93c5a042e1762acd6f1571b001b988071fd87dca76aaa3651eb3869984a859e` | [View Tx](https://stellar.expert/explorer/testnet/tx/a93c5a042e1762acd6f1571b001b988071fd87dca76aaa3651eb3869984a859e) | **SUCCESS** |
| **5. Create Gift #1 (`1.0 NVDA`)** | `create_gift(...)` | `a45ef1cc24c138ccfd2b9e55645247482a4621004816535ec819e45ef902f5cc` | [View Tx](https://stellar.expert/explorer/testnet/tx/a45ef1cc24c138ccfd2b9e55645247482a4621004816535ec819e45ef902f5cc) | **SUCCESS** |
| **6. Gasless Claim Gift #1 (`NVDA`)** | `claim(1, recipient, signature)` | `abdefd9b50f8575178869779022ab3e1171046eefcc460595e1b92dc2c93b109` | [View Tx](https://stellar.expert/explorer/testnet/tx/abdefd9b50f8575178869779022ab3e1171046eefcc460595e1b92dc2c93b109) | **SUCCESS** |
| **7. Create Open Gift #2 (`0.5 AAPL`)** | `create_gift(...)` | `5b8b7809ae715c90e2259c21b46d2c90982ab7a1ddd0437e7a97df4119dfe251` | [View Tx](https://stellar.expert/explorer/testnet/tx/5b8b7809ae715c90e2259c21b46d2c90982ab7a1ddd0437e7a97df4119dfe251) | **SUCCESS** |
| **8. Create Open Gift #3 (`0.7 NVDA`)** | `create_gift(...)` | `1b6661dcccc7dd4e76de910354c384f18ae19f89f21a5b8f5ebdfa85d0af9bfc` | [View Tx](https://stellar.expert/explorer/testnet/tx/1b6661dcccc7dd4e76de910354c384f18ae19f89f21a5b8f5ebdfa85d0af9bfc) | **SUCCESS** |

---

## 2. Live CLI Verification Commands (Run Directly Against Stellar Testnet)

You can verify the live contract state right now using the `stellar` CLI:

### 2.1 Verify All 11 Listed SAC Tokens (`listed_tokens`)
```bash
stellar contract invoke \
  --id CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4 \
  --source-account GAZWESWQPZOIH2EH3IL37THBLKGLAC5FCHTLMWAXJGLKJPT4NRRIHN6B \
  --network testnet \
  --send=no \
  -- listed_tokens
```
**Live Output:**
```json
[
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  "CBUEWQFAQJUMIU7PU6U64Q35NCGF752BB7JHYKMEUZ6OA7767S66EYJB",
  "CAX6GMJ7R4SKDEPHDFPJJMGYXNBWNFUOLDZZIQUV3PMRIMDRGUEY3RZV",
  "CCX7WIJYXP2HXPMKKAOLYSMTVTLFYZDRBC5OR3O4S2QGBGUWN5NZQUVU",
  "CA566SBZVF5XPOHA5IBIDNSKJ7OBD5UT7V5LZZUSSQCXJ3BQ7RXNMVAU",
  "CCSCABC5NOE7VSZY7FJOOQOGVIHIHCXW2G5ETERS3J2CPAMF3DKFLAOL",
  "CDLGAWB22W2PSU6UBTIC2O2XOX7AXQQXEM6V4TGIZWW6OH6VA6NAHXJD",
  "CABP7JTR5F7VAX73NIWFAMJVN3HDAOG6TALS62UEUQHY3ZSJ3T23VKWC",
  "CCD3SEF2BGN4FSSQLXACT2V2I7QWVA2HW54HJCWJMKHKJ7ZYSXXCSH5Z",
  "CCON7JI5MMA2A55E4K6VCAVQV4GXP37BLPBRIKENFPSSP33ADTF7C7Q7"
]
```

### 2.2 Query Next Gift ID (`next_gift_id`)
```bash
stellar contract invoke \
  --id CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4 \
  --source-account GAZWESWQPZOIH2EH3IL37THBLKGLAC5FCHTLMWAXJGLKJPT4NRRIHN6B \
  --network testnet \
  --send=no \
  -- next_gift_id
```
**Live Output:** `4` (Gifts #1, #2, and #3 exist on-chain).

### 2.3 Inspect Gift #1 (`1.0 NVDA`, Claimed) and Gift #2 (`0.5 AAPL`, Open)
```bash
stellar contract invoke \
  --id CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4 \
  --source-account GAZWESWQPZOIH2EH3IL37THBLKGLAC5FCHTLMWAXJGLKJPT4NRRIHN6B \
  --network testnet \
  --send=no \
  -- get_gift --gift_id 1
```

---

## 3. Deployed Stellar Asset Contracts (SACs) on Stellar Testnet

| Symbol | Asset Name | Deployed Stellar SAC Contract ID (Testnet) | Issuer Account | Decimals | Explorer Link |
|:---:|---|---|---|:---:|:---:|
| **AAPL** | Apple Inc. | `CBUEWQFAQJUMIU7PU6U64Q35NCGF752BB7JHYKMEUZ6OA7767S66EYJB` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBUEWQFAQJUMIU7PU6U64Q35NCGF752BB7JHYKMEUZ6OA7767S66EYJB) |
| **NVDA** | NVIDIA Corp | `CAX6GMJ7R4SKDEPHDFPJJMGYXNBWNFUOLDZZIQUV3PMRIMDRGUEY3RZV` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CAX6GMJ7R4SKDEPHDFPJJMGYXNBWNFUOLDZZIQUV3PMRIMDRGUEY3RZV) |
| **TSLA** | Tesla, Inc. | `CCX7WIJYXP2HXPMKKAOLYSMTVTLFYZDRBC5OR3O4S2QGBGUWN5NZQUVU` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCX7WIJYXP2HXPMKKAOLYSMTVTLFYZDRBC5OR3O4S2QGBGUWN5NZQUVU) |
| **MSFT** | Microsoft Corp | `CA566SBZVF5XPOHA5IBIDNSKJ7OBD5UT7V5LZZUSSQCXJ3BQ7RXNMVAU` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CA566SBZVF5XPOHA5IBIDNSKJ7OBD5UT7V5LZZUSSQCXJ3BQ7RXNMVAU) |
| **AMZN** | Amazon.com Inc. | `CCSCABC5NOE7VSZY7FJOOQOGVIHIHCXW2G5ETERS3J2CPAMF3DKFLAOL` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCSCABC5NOE7VSZY7FJOOQOGVIHIHCXW2G5ETERS3J2CPAMF3DKFLAOL) |
| **GOOGL**| Alphabet Inc. | `CDLGAWB22W2PSU6UBTIC2O2XOX7AXQQXEM6V4TGIZWW6OH6VA6NAHXJD` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDLGAWB22W2PSU6UBTIC2O2XOX7AXQQXEM6V4TGIZWW6OH6VA6NAHXJD) |
| **META** | Meta Platforms | `CABP7JTR5F7VAX73NIWFAMJVN3HDAOG6TALS62UEUQHY3ZSJ3T23VKWC` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CABP7JTR5F7VAX73NIWFAMJVN3HDAOG6TALS62UEUQHY3ZSJ3T23VKWC) |
| **SPY**  | SPDR S&P 500 ETF | `CCD3SEF2BGN4FSSQLXACT2V2I7QWVA2HW54HJCWJMKHKJ7ZYSXXCSH5Z` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCD3SEF2BGN4FSSQLXACT2V2I7QWVA2HW54HJCWJMKHKJ7ZYSXXCSH5Z) |
| **QQQ**  | Invesco QQQ Trust | `CCON7JI5MMA2A55E4K6VCAVQV4GXP37BLPBRIKENFPSSP33ADTF7C7Q7` | `GAJZNVL4...NNFN` | 7 | [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CCON7JI5MMA2A55E4K6VCAVQV4GXP37BLPBRIKENFPSSP33ADTF7C7Q7) |

---

## 4. Automated Test Suite Results

### 4.1 Soroban Smart Contracts Test Suite (`cargo test`)
```text
running 9 tests
test test_pause_unpause_and_admin_auth_tree ... ok
test test_constructor_and_view_functions ... ok
test test_set_token_listed_dynamic_allowlist ... ok
test test_refund_expired_success ... ok
test test_unpausable_refund ... ok
test test_rescue_surplus_protects_open_gift_liabilities ... ok
test test_negative_security_guards_and_error_paths ... ok
test test_create_gift_and_claim_success_with_auth_verification ... ok
test test_multi_venue_tokenized_stocks_and_liabilities ... ok

test result: ok. 9 passed; 0 failed
```
