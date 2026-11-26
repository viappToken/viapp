// Verified Stellar Testnet transactions and Soroban GiftVault contract behind the viapp protocol.
export const STELLAR_VAULT_ID = "CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4";
export const STELLAR_ISSUER_ID = "GAJZNVL4IOXRII77S22CHDW7E2UWICAMWLFMX22B3YW2PVBQ7RLNNNFN";
export const STELLAR_RELAYER_ID = "GANCS3FFF5TPPCBCNO4MFTMEIMDK4BO2LJYTEBG57F3DNX7JRYJ5WTKH";

export const PROOF = {
  firstBuy: "fd96a64efd56f2005299ec92b90cfbfb7af8f21fd91fc5e091d1286374d4f39a",
  gift1Locked: "a45ef1cc24c138ccfd2b9e55645247482a4621004816535ec819e45ef902f5cc",
  gift1Claimed: "abdefd9b50f8575178869779022ab3e1171046eefcc460595e1b92dc2c93b109",
  gift2Wrapped: "5b8b7809ae715c90e2259c21b46d2c90982ab7a1ddd0437e7a97df4119dfe251",
  gift2Claimed: "1b6661dcccc7dd4e76de910354c384f18ae19f89f21a5b8f5ebdfa85d0af9bfc",
} as const;

/** A hash or address formatted: a45ef1...f5cc. */
export function shortHex(value: string): string {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export function txUrl(hash: string): string {
  const clean = hash.startsWith("0x") ? hash.slice(2) : hash;
  return `https://stellar.expert/explorer/testnet/tx/${clean}`;
}

export function addressUrl(address: string): string {
  if (address.startsWith("C")) {
    return `https://stellar.expert/explorer/testnet/contract/${address}`;
  }
  return `https://stellar.expert/explorer/testnet/account/${address}`;
}

/** The vault's verified Soroban contract on StellarExpert. */
export function sourceUrl(address: string): string {
  const target = address.startsWith("C") ? address : STELLAR_VAULT_ID;
  return `https://stellar.expert/explorer/testnet/contract/${target}`;
}
