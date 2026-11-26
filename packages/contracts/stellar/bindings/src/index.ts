import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDG2MIJEGLAIS37FXNF3KSFIQYL4VN5AUVLRLXK47SHQTHVVILPKCBD4",
  }
} as const


export interface Gift {
  amount: i128;
  claim_key: Buffer;
  expiry: u64;
  sealed_note: Buffer;
  sender: string;
  state: State;
  token: string;
}

export enum State {
  None = 0,
  Open = 1,
  Claimed = 2,
  Refunded = 3,
}







export const VaultError = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  3: {message:"Unauthorized"},
  4: {message:"NotRelayer"},
  5: {message:"TokenNotListed"},
  6: {message:"ZeroAmount"},
  7: {message:"ZeroClaimKey"},
  8: {message:"ClaimKeyAlreadyUsed"},
  9: {message:"ExpiryOutOfRange"},
  10: {message:"NoteTooLong"},
  11: {message:"GiftNotOpen"},
  12: {message:"GiftExpired"},
  13: {message:"GiftNotExpired"},
  14: {message:"BadRecipient"},
  15: {message:"BadSigner"},
  16: {message:"BadKeyProof"},
  17: {message:"Paused"},
  18: {message:"NoAmountReceived"},
  19: {message:"TooManyTokens"},
  20: {message:"NothingToRescue"}
}

export interface Client {
  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Pays an open gift to `recipient`, authorized by a signature from the gift's claim key.
   */
  claim: ({gift_id, recipient, signature}: {gift_id: u64, recipient: string, signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a pause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  pause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a refund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns an expired, unclaimed gift to its original sender. Unpausable.
   */
  refund: ({gift_id}: {gift_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a relayer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  relayer: (options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a unpause transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unpause: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_gift transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_gift: ({gift_id}: {gift_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Gift>>>

  /**
   * Construct and simulate a is_listed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_listed: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a is_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_paused: (options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a extend_ttl transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  extend_ttl: (options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initializes the vault with its owner, relayer and initial listed token list.
   * Requires admin authorization to prevent front-running when deployed without constructor arguments.
   */
  initialize: ({admin, relayer, initial_tokens}: {admin: string, relayer: string, initial_tokens: Array<string>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a create_gift transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Locks `amount` of a listed `token` from `sender` as a new gift that can be claimed by the holder of `claim_key`.
   */
  create_gift: ({sender, token, amount, claim_key, expiry, sealed_note, key_proof}: {sender: string, token: string, amount: i128, claim_key: Buffer, expiry: u64, sealed_note: Buffer, key_proof: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a liabilities transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  liabilities: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a set_relayer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_relayer: ({new_relayer}: {new_relayer: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a next_gift_id transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  next_gift_id: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

  /**
   * Construct and simulate a listed_tokens transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  listed_tokens: (options?: MethodOptions) => Promise<AssembledTransaction<Array<string>>>

  /**
   * Construct and simulate a rescue_surplus transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Rescues tokens sent to the vault outside of `create_gift` (strictly above open gift liabilities).
   */
  rescue_surplus: ({token, to}: {token: string, to: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a set_token_listed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds or removes a token from the active gifting allowlist. Only callable by admin.
   */
  set_token_listed: ({token, listed}: {token: string, listed: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<boolean>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin, relayer, initial_tokens}: {admin: string, relayer: string, initial_tokens: Array<string>},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({admin, relayer, initial_tokens}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAFZQYXlzIGFuIG9wZW4gZ2lmdCB0byBgcmVjaXBpZW50YCwgYXV0aG9yaXplZCBieSBhIHNpZ25hdHVyZSBmcm9tIHRoZSBnaWZ0J3MgY2xhaW0ga2V5LgAAAAAABWNsYWltAAAAAAAAAwAAAAAAAAAHZ2lmdF9pZAAAAAAGAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQAAAAAEAAAPpAAAAAgAAB9AAAAAKVmF1bHRFcnJvcgAA",
        "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAAAAAEZSZXR1cm5zIGFuIGV4cGlyZWQsIHVuY2xhaW1lZCBnaWZ0IHRvIGl0cyBvcmlnaW5hbCBzZW5kZXIuIFVucGF1c2FibGUuAAAAAAAGcmVmdW5kAAAAAAABAAAAAAAAAAdnaWZ0X2lkAAAAAAYAAAABAAAD6QAAAAIAAAfQAAAAClZhdWx0RXJyb3IAAA==",
        "AAAAAAAAAAAAAAAHcmVsYXllcgAAAAAAAAAAAQAAA+gAAAAT",
        "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAQAAA+kAAAACAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAAAAAAAAAAAIZ2V0X2dpZnQAAAABAAAAAAAAAAdnaWZ0X2lkAAAAAAYAAAABAAAD6AAAB9AAAAAER2lmdA==",
        "AAAAAAAAAAAAAAAJaXNfbGlzdGVkAAAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAJaXNfcGF1c2VkAAAAAAAAAAAAAAEAAAAB",
        "AAAAAAAAAAAAAAAKZXh0ZW5kX3R0bAAAAAAAAAAAAAEAAAPpAAAAAgAAB9AAAAAKVmF1bHRFcnJvcgAA",
        "AAAAAAAAAK9Jbml0aWFsaXplcyB0aGUgdmF1bHQgd2l0aCBpdHMgb3duZXIsIHJlbGF5ZXIgYW5kIGluaXRpYWwgbGlzdGVkIHRva2VuIGxpc3QuClJlcXVpcmVzIGFkbWluIGF1dGhvcml6YXRpb24gdG8gcHJldmVudCBmcm9udC1ydW5uaW5nIHdoZW4gZGVwbG95ZWQgd2l0aG91dCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAppbml0aWFsaXplAAAAAAADAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAB3JlbGF5ZXIAAAAAEwAAAAAAAAAOaW5pdGlhbF90b2tlbnMAAAAAA+oAAAATAAAAAQAAA+kAAAACAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAAAAAHBMb2NrcyBgYW1vdW50YCBvZiBhIGxpc3RlZCBgdG9rZW5gIGZyb20gYHNlbmRlcmAgYXMgYSBuZXcgZ2lmdCB0aGF0IGNhbiBiZSBjbGFpbWVkIGJ5IHRoZSBob2xkZXIgb2YgYGNsYWltX2tleWAuAAAAC2NyZWF0ZV9naWZ0AAAAAAcAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAAAZleHBpcnkAAAAAAAYAAAAAAAAAC3NlYWxlZF9ub3RlAAAAAA4AAAAAAAAACWtleV9wcm9vZgAAAAAAA+4AAABAAAAAAQAAA+kAAAAGAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAAAAAAAAAAALbGlhYmlsaXRpZXMAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAALc2V0X3JlbGF5ZXIAAAAAAQAAAAAAAAALbmV3X3JlbGF5ZXIAAAAAEwAAAAEAAAPpAAAAAgAAB9AAAAAKVmF1bHRFcnJvcgAA",
        "AAAAAAAAAAAAAAAMbmV4dF9naWZ0X2lkAAAAAAAAAAEAAAAG",
        "AAAAAAAAAF5BdG9taWMgQ0FQLTAwNTggY29uc3RydWN0b3IgY2FsbGVkIGF0IGRlcGxveW1lbnQgdGltZSB3aGVuIGNvbnN0cnVjdG9yIGFyZ3VtZW50cyBhcmUgcHJvdmlkZWQuAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAMAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAHcmVsYXllcgAAAAATAAAAAAAAAA5pbml0aWFsX3Rva2VucwAAAAAD6gAAABMAAAAA",
        "AAAAAAAAAAAAAAANbGlzdGVkX3Rva2VucwAAAAAAAAAAAAABAAAD6gAAABM=",
        "AAAAAAAAAGFSZXNjdWVzIHRva2VucyBzZW50IHRvIHRoZSB2YXVsdCBvdXRzaWRlIG9mIGBjcmVhdGVfZ2lmdGAgKHN0cmljdGx5IGFib3ZlIG9wZW4gZ2lmdCBsaWFiaWxpdGllcykuAAAAAAAADnJlc2N1ZV9zdXJwbHVzAAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAAAnRvAAAAAAATAAAAAQAAA+kAAAALAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAAAAAFJBZGRzIG9yIHJlbW92ZXMgYSB0b2tlbiBmcm9tIHRoZSBhY3RpdmUgZ2lmdGluZyBhbGxvd2xpc3QuIE9ubHkgY2FsbGFibGUgYnkgYWRtaW4uAAAAAAAQc2V0X3Rva2VuX2xpc3RlZAAAAAIAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGbGlzdGVkAAAAAAABAAAAAQAAA+kAAAABAAAH0AAAAApWYXVsdEVycm9yAAA=",
        "AAAAAQAAAAAAAAAAAAAABEdpZnQAAAAHAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACWNsYWltX2tleQAAAAAAA+4AAAAgAAAAAAAAAAZleHBpcnkAAAAAAAYAAAAAAAAAC3NlYWxlZF9ub3RlAAAAAA4AAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAFc3RhdGUAAAAAAAfQAAAABVN0YXRlAAAAAAAAAAAAAAV0b2tlbgAAAAAAABM=",
        "AAAAAwAAAAAAAAAAAAAABVN0YXRlAAAAAAAABAAAAAAAAAAETm9uZQAAAAAAAAAAAAAABE9wZW4AAAABAAAAAAAAAAdDbGFpbWVkAAAAAAIAAAAAAAAACFJlZnVuZGVkAAAAAw==",
        "AAAABQAAAAAAAAAAAAAAC0dpZnRDbGFpbWVkAAAAAAEAAAAMZ2lmdF9jbGFpbWVkAAAAAgAAAAAAAAAHZ2lmdF9pZAAAAAAGAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAAC0dpZnRDcmVhdGVkAAAAAAEAAAAMZ2lmdF9jcmVhdGVkAAAABAAAAAAAAAAGc2VuZGVyAAAAAAATAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAHZ2lmdF9pZAAAAAAGAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC1Rva2VuTGlzdGVkAAAAAAEAAAAMdG9rZW5fbGlzdGVkAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAGbGlzdGVkAAAAAAABAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADEdpZnRSZWZ1bmRlZAAAAAEAAAANZ2lmdF9yZWZ1bmRlZAAAAAAAAAIAAAAAAAAAB2dpZnRfaWQAAAAABgAAAAEAAAAAAAAABnNlbmRlcgAAAAAAEwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADlJlbGF5ZXJVcGRhdGVkAAAAAAABAAAAD3JlbGF5ZXJfdXBkYXRlZAAAAAABAAAAAAAAAAtuZXdfcmVsYXllcgAAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAADlN1cnBsdXNSZXNjdWVkAAAAAAABAAAAD3N1cnBsdXNfcmVzY3VlZAAAAAADAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAAClZhdWx0RXJyb3IAAAAAABQAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAAAAAAAADFVuYXV0aG9yaXplZAAAAAMAAAAAAAAACk5vdFJlbGF5ZXIAAAAAAAQAAAAAAAAADlRva2VuTm90TGlzdGVkAAAAAAAFAAAAAAAAAApaZXJvQW1vdW50AAAAAAAGAAAAAAAAAAxaZXJvQ2xhaW1LZXkAAAAHAAAAAAAAABNDbGFpbUtleUFscmVhZHlVc2VkAAAAAAgAAAAAAAAAEEV4cGlyeU91dE9mUmFuZ2UAAAAJAAAAAAAAAAtOb3RlVG9vTG9uZwAAAAAKAAAAAAAAAAtHaWZ0Tm90T3BlbgAAAAALAAAAAAAAAAtHaWZ0RXhwaXJlZAAAAAAMAAAAAAAAAA5HaWZ0Tm90RXhwaXJlZAAAAAAADQAAAAAAAAAMQmFkUmVjaXBpZW50AAAADgAAAAAAAAAJQmFkU2lnbmVyAAAAAAAADwAAAAAAAAALQmFkS2V5UHJvb2YAAAAAEAAAAAAAAAAGUGF1c2VkAAAAAAARAAAAAAAAABBOb0Ftb3VudFJlY2VpdmVkAAAAEgAAAAAAAAANVG9vTWFueVRva2VucwAAAAAAABMAAAAAAAAAD05vdGhpbmdUb1Jlc2N1ZQAAAAAU" ]),
      options
    )
  }
  public readonly fromJSON = {
    admin: this.txFromJSON<Option<string>>,
        claim: this.txFromJSON<Result<void>>,
        pause: this.txFromJSON<Result<void>>,
        refund: this.txFromJSON<Result<void>>,
        relayer: this.txFromJSON<Option<string>>,
        unpause: this.txFromJSON<Result<void>>,
        get_gift: this.txFromJSON<Option<Gift>>,
        is_listed: this.txFromJSON<boolean>,
        is_paused: this.txFromJSON<boolean>,
        extend_ttl: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<Result<void>>,
        create_gift: this.txFromJSON<Result<u64>>,
        liabilities: this.txFromJSON<i128>,
        set_relayer: this.txFromJSON<Result<void>>,
        next_gift_id: this.txFromJSON<u64>,
        listed_tokens: this.txFromJSON<Array<string>>,
        rescue_surplus: this.txFromJSON<Result<i128>>,
        set_token_listed: this.txFromJSON<Result<boolean>>
  }
}