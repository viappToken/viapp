import { Asset } from "@stellar/stellar-sdk";

export type StockVenue = "bnb" | "stellar";

export type StellarStock = {
  chain: "stellar";
  address: string;
  code: string;
  symbol: string;
  issuer: string;
  contractId: string;
  name: string;
  decimals: number;
  uiMultiplier: string;
  priceUsd: string | null;
  market: {
    open: boolean | null;
    reasonCode: string | null;
    reasonMsg: string | null;
    nextOpenTime: number | null;
  };
  logoUrl: string | null;
  venue?: StockVenue;
  backingSymbol?: string;
  backingContract?: string;
};

// ViApp dedicated Testnet tokenized stock issuer account (deployed & verified on Stellar Testnet)
export const STELLAR_TESTNET_ISSUER = "GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN";
// Circle's canonical Testnet and Mainnet USDC issuers
export const STELLAR_TESTNET_USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const STELLAR_MAINNET_USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const STELLAR_MAINNET_ISSUER = "GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN";

export const STELLAR_STOCKS_CATALOG: Omit<StellarStock, "contractId" | "address" | "symbol">[] = [
  // --- 9 Core Tokenized Stocks Issued as Stellar Asset Contracts (SACs) ---
  {
    chain: "stellar",
    code: "AAPL",
    name: "Apple Inc.",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "228.50",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "AAPLB",
    backingContract: "0x431a3BEE82E2ca41e49895CbECE5bB0F76A89b7A",
  },
  {
    chain: "stellar",
    code: "NVDA",
    name: "NVIDIA Corp",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "142.20",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "NVDAB",
    backingContract: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436",
  },
  {
    chain: "stellar",
    code: "TSLA",
    name: "Tesla, Inc.",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "248.80",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "TSLAB",
    backingContract: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f",
  },
  {
    chain: "stellar",
    code: "MSFT",
    name: "Microsoft Corp",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "418.30",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "MSFTB",
    backingContract: "0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0",
  },
  {
    chain: "stellar",
    code: "AMZN",
    name: "Amazon.com Inc.",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "186.40",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "AMZNB",
    backingContract: "0x1a4b499833A79A09ad7Cf1D42D7DacF71e92eb00",
  },
  {
    chain: "stellar",
    code: "GOOGL",
    name: "Alphabet Inc.",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "167.10",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "GOOGLB",
    backingContract: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238",
  },
  {
    chain: "stellar",
    code: "META",
    name: "Meta Platforms Inc.",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "589.60",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "METAB",
    backingContract: "0x7425889FE94F9d693E8daefE88BCCed6AcFEf4c0",
  },
  {
    chain: "stellar",
    code: "SPY",
    name: "SPDR S&P 500 ETF",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "572.30",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "SPYB",
    backingContract: "0x7138b48df7D98D7e3cc221BfE7192D0a178182D8",
  },
  {
    chain: "stellar",
    code: "QQQ",
    name: "Invesco QQQ Trust",
    issuer: STELLAR_TESTNET_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "488.90",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "bnb",
    backingSymbol: "QQQB",
    backingContract: "0x205812CdBed920aFf76C6580abD681a46D11efc7",
  },

  // --- Settlement Currencies & Cash Equivalents on Stellar ---
  {
    chain: "stellar",
    code: "USDC",
    name: "USD Coin",
    issuer: STELLAR_TESTNET_USDC_ISSUER,
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "1.00",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "stellar",
  },
  {
    chain: "stellar",
    code: "XLM",
    name: "Stellar Lumens",
    issuer: "", // Native asset
    decimals: 7,
    uiMultiplier: "10000000",
    priceUsd: "0.10",
    market: { open: true, reasonCode: null, reasonMsg: null, nextOpenTime: null },
    logoUrl: null,
    venue: "stellar",
  },
];

export function getStellarStocks(networkPassphrase: string, venue?: StockVenue): StellarStock[] {
  let stocks = STELLAR_STOCKS_CATALOG.filter(
    (item) => item.code !== "USDC" && item.code !== "XLM",
  );
  if (venue) {
    stocks = stocks.filter((item) => item.venue === venue);
  }
  return stocks.map((item) => {
    const asset = item.code === "XLM" ? Asset.native() : new Asset(item.code, item.issuer);
    let contractId = "";
    try {
      contractId = asset.contractId(networkPassphrase);
    } catch {
      contractId = item.code;
    }
    return {
      ...item,
      address: contractId,
      symbol: item.code,
      contractId,
    };
  });
}

export function getAllStellarCatalogAssets(networkPassphrase: string): StellarStock[] {
  return STELLAR_STOCKS_CATALOG.map((item) => {
    const asset = item.code === "XLM" ? Asset.native() : new Asset(item.code, item.issuer);
    let contractId = "";
    try {
      contractId = asset.contractId(networkPassphrase);
    } catch {
      contractId = item.code;
    }
    return {
      ...item,
      address: contractId,
      symbol: item.code,
      contractId,
    };
  });
}

export function getBscStocks(networkPassphrase: string): StellarStock[] {
  return getStellarStocks(networkPassphrase, "bnb");
}

export function findStellarStock(code: string, networkPassphrase: string): StellarStock | undefined {
  if (!code || typeof code !== "string") return undefined;
  const raw = code.trim();
  if (raw.length === 0) return undefined;

  const strippedPair = raw.replace(/\/(USDC|XLM)$/i, "").replace(/-(USDC|XLM)$/i, "");
  const normalized = strippedPair.toUpperCase();
  const allAssets = getAllStellarCatalogAssets(networkPassphrase);

  const direct = allAssets.find(
    (s) =>
      s.code.toUpperCase() === normalized ||
      s.symbol.toUpperCase() === normalized ||
      s.contractId.toUpperCase() === normalized ||
      s.address.toUpperCase() === normalized ||
      s.backingSymbol?.toUpperCase() === normalized,
  );
  if (direct) return direct;

  const cleanAlnum = normalized.replace(/[^A-Z0-9]/g, "");
  const alnumMatch = allAssets.find(
    (s) =>
      s.code.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanAlnum ||
      s.backingSymbol?.toUpperCase().replace(/[^A-Z0-9]/g, "") === cleanAlnum,
  );
  if (alnumMatch) return alnumMatch;

  if (/^B[A-Z0-9]+$/i.test(cleanAlnum)) {
    const rest = cleanAlnum.slice(1);
    const prefixMatch = allAssets.find(
      (s) =>
        s.code.toUpperCase() === rest ||
        s.symbol.toUpperCase() === rest,
    );
    if (prefixMatch) return prefixMatch;
  }

  const base = cleanAlnum.replace(/B$/, "");
  if (base.length > 0) {
    const baseMatch = allAssets.find((s) => {
      const sBase = s.code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/B$/, "");
      return sBase === base;
    });
    if (baseMatch) return baseMatch;
  }

  return undefined;
}
