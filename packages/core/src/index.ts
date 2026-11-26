/**
 * @viapp/core
 * Public entrypoint for ViApp core library on Stellar.
 */

// Stellar SEP Standards (SEP-0001, SEP-0010, SEP-0024, SEP-0038)
export * from "./sep1.js";
export * from "./sep10.js";
export * from "./sep24.js";
export * from "./sep38.js";

// Stellar Client, Soroban Contract Operations & Live RPC Reader
export * from "./client/stellar.js";
export * from "./stellar-rpc.js";

// Stocks, Trading, Quoting & Reserve Attestations on Stellar
export * from "./stocks-stellar.js";
export * from "./trade-stellar.js";
export * from "./quote-stellar.js";
export * from "./bridge.js";

// Amounts & Math Helpers
export * from "./amounts.js";

// Gift Data Structures & Key Derivations
export * from "./gift.js";
