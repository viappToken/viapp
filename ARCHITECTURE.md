# ViApp Protocol Architecture

ViApp enables anyone to send a friend their first real tokenized stock (Apple, NVIDIA, Tesla, S&P 500) as a shareable link. The recipient claims the share using Google, email, or a Stellar passkey with no seed phrase, no browser extension, and zero transaction fees.

For the comprehensive Stellar specification, live testnet contract verifications, and protocol sequence diagrams, see:
- [Stellar Protocol Architecture Specification](docs/ARCHITECTURE.md)
- [Native Tokenization & Direct Liquidation Roadmap](docs/ROADMAP.md)
- [Stellar Community Fund (SCF) Proposal](docs/GRANT_PROPOSAL.md)

---

## 1. High-Level System Overview

```mermaid
flowchart TD
    subgraph Client["Client Interface"]
        Sender["Gift Sender\n(XLM / USDC on Stellar)"]
        Recipient["Gift Recipient\n(Web Browser / Google / Passkey)"]
    end

    subgraph AppLayer["Application Layer (@viapp/web)"]
        UI["ViApp Web App\n(Next.js 16 + Tailwind)"]
        Relayer["ViApp Gasless Relayer\n(Submits claim transactions)"]
    end

    subgraph CoreLayer["Core Protocol (@viapp/core)"]
        StellarClient["Soroban SDK Transaction Builders"]
        SEP["SEP Engine\n(SEP-1, SEP-10, SEP-24, SEP-38, SEP-41)"]
        Bridge["Pegging & Native Settlement Engine"]
    end

    subgraph OnChain["Stellar Network (Soroban)"]
        Vault["GiftVault Smart Contract\nCDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4"]
        SAC["Stellar Asset Contracts\n(Native XLM, USDC, 9 Stocks)"]
        SDEX["Stellar SDEX & Soroban AMM\n(Direct On-Chain Liquidation)"]
    end

    Sender -->|1. Select Stock & Pay XLM/USDC| UI
    UI --> CoreLayer
    CoreLayer -->|2. Create Gift & Lock Tokens| Vault
    Vault -->|3. Escrow Tokens| SAC
    UI -->|4. Generate Claim Link| Sender
    Sender -.->|5. Sends Link (SMS / WhatsApp / Email)| Recipient
    Recipient -->|6. Opens Link & Authenticates| UI
    UI -->|7. Signed Claim Payload| Relayer
    Relayer -->|8. Submits gasless claim()| Vault
    Vault -->|9. Transfers Stock to Recipient| SAC
    Recipient -.->|10. 1-Click Liquidation| SDEX
```

---

## 2. Deployed Soroban Smart Contract & Live Testnet Evidence

- **Contract ID:** [`CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4`](https://stellar.expert/explorer/testnet/contract/CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4)
- **WASM Hash (`wasm32v1-none`):** `14e4c5a834f2bd49719a030108c7b9140c6cdeca89859a0f84e58ecc004127b5`
- **Deploy Transaction:** [`91a51bd5...85d2`](https://stellar.expert/explorer/testnet/tx/91a51bd598a3f77e3ca50cd0ba5cd96c8b23d53e6174cb444137ab88761e85d2)
- **Live Gift Creation Tx (`1.0 NVDA`):** [`a45ef1cc...f5cc`](https://stellar.expert/explorer/testnet/tx/a45ef1cc24c138ccfd2b9e55645247482a4621004816535ec819e45ef902f5cc)
- **Live Gasless Claim Tx (`1.0 NVDA`):** [`abdefd9b...b109`](https://stellar.expert/explorer/testnet/tx/abdefd9b50f8575178869779022ab3e1171046eefcc460595e1b92dc2c93b109)
