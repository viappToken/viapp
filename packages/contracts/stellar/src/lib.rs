#![no_std]

pub mod errors;
pub mod types;

use errors::VaultError;
use types::{
    DataKey, Gift, GiftClaimed, GiftCreated, GiftRefunded, RelayerUpdated, State, SurplusRescued,
    TokenListed,
};

use soroban_sdk::{
    contract, contractimpl, panic_with_error, token, Address, Bytes, BytesN, Env, Vec,
};

const MIN_LIFETIME: u64 = 3600; // 1 hour
const MAX_LIFETIME: u64 = 90 * 86400; // 90 days
const MAX_NOTE_BYTES: u32 = 512;
const MAX_TOKENS: u32 = 32;

// Storage TTL extensions (~30 days instance bump, ~95 days persistent bump)
const INSTANCE_BUMP_AMOUNT: u32 = 30 * 86400 / 5;
const INSTANCE_LIFETIME_THRESHOLD: u32 = 7 * 86400 / 5;
const PERSISTENT_BUMP_AMOUNT: u32 = 95 * 86400 / 5;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = 30 * 86400 / 5;

#[contract]
pub struct GiftVault;

#[contractimpl]
impl GiftVault {
    /// Atomic CAP-0058 constructor called at deployment time when constructor arguments are provided.
    pub fn __constructor(
        env: Env,
        admin: Address,
        relayer: Address,
        initial_tokens: Vec<Address>,
    ) {
        if let Err(err) = Self::init_internal(&env, admin, relayer, initial_tokens) {
            panic_with_error!(&env, err);
        }
    }

    /// Initializes the vault with its owner, relayer and initial listed token list.
    /// Requires admin authorization to prevent front-running when deployed without constructor arguments.
    pub fn initialize(
        env: Env,
        admin: Address,
        relayer: Address,
        initial_tokens: Vec<Address>,
    ) -> Result<(), VaultError> {
        admin.require_auth();
        Self::init_internal(&env, admin, relayer, initial_tokens)
    }

    fn init_internal(
        env: &Env,
        admin: Address,
        relayer: Address,
        initial_tokens: Vec<Address>,
    ) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::AlreadyInitialized);
        }
        if initial_tokens.len() > MAX_TOKENS {
            return Err(VaultError::TooManyTokens);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Relayer, &relayer);
        env.storage().instance().set(&DataKey::NextGiftId, &1u64);
        env.storage().instance().set(&DataKey::IsPaused, &false);

        let mut listed = Vec::new(env);
        for token in initial_tokens.iter() {
            let key = DataKey::IsListed(token.clone());
            env.storage().persistent().set(&key, &true);
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
            listed.push_back(token);
        }
        env.storage()
            .persistent()
            .set(&DataKey::ListedTokens, &listed);
        env.storage().persistent().extend_ttl(
            &DataKey::ListedTokens,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        Ok(())
    }

    /// Locks `amount` of a listed `token` from `sender` as a new gift that can be claimed by the holder of `claim_key`.
    pub fn create_gift(
        env: Env,
        sender: Address,
        token: Address,
        amount: i128,
        claim_key: BytesN<32>,
        expiry: u64,
        sealed_note: Bytes,
        key_proof: BytesN<64>,
    ) -> Result<u64, VaultError> {
        sender.require_auth();

        if Self::is_paused(&env) {
            return Err(VaultError::Paused);
        }
        if !Self::is_listed(&env, &token) {
            return Err(VaultError::TokenNotListed);
        }
        if amount <= 0 {
            return Err(VaultError::ZeroAmount);
        }
        if sealed_note.len() > MAX_NOTE_BYTES {
            return Err(VaultError::NoteTooLong);
        }

        let now = env.ledger().timestamp();
        if expiry < now + MIN_LIFETIME || expiry > now + MAX_LIFETIME {
            return Err(VaultError::ExpiryOutOfRange);
        }

        let used_key = DataKey::ClaimKeyUsed(claim_key.clone());
        if env.storage().persistent().has(&used_key) {
            return Err(VaultError::ClaimKeyAlreadyUsed);
        }

        // Verify key_proof over sha256("viapp:register:{network}:{contract_id}:{sender}")
        let mut msg = Bytes::new(&env);
        msg.append(&Bytes::from_slice(&env, b"viapp:register:"));
        msg.append(&env.ledger().network_id().into());
        msg.append(&env.current_contract_address().to_string().to_bytes());
        msg.append(&sender.to_string().to_bytes());
        let register_digest: BytesN<32> = env.crypto().sha256(&msg).into();

        env.crypto()
            .ed25519_verify(&claim_key, &register_digest.into(), &key_proof);

        // Pull tokens from sender into contract and verify received balance delta
        let client = token::Client::new(&env, &token);
        let contract_addr = env.current_contract_address();
        let balance_before = client.balance(&contract_addr);
        client.transfer(&sender, &contract_addr, &amount);
        let balance_after = client.balance(&contract_addr);
        if balance_after <= balance_before {
            return Err(VaultError::NoAmountReceived);
        }
        let received = balance_after - balance_before;

        let gift_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextGiftId)
            .unwrap_or(1);
        env.storage()
            .instance()
            .set(&DataKey::NextGiftId, &(gift_id + 1));

        env.storage().persistent().set(&used_key, &true);
        env.storage().persistent().extend_ttl(
            &used_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let liab_key = DataKey::Liabilities(token.clone());
        let current_liabilities: i128 = env.storage().persistent().get(&liab_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&liab_key, &(current_liabilities + received));
        env.storage().persistent().extend_ttl(
            &liab_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let gift = Gift {
            token: token.clone(),
            sender: sender.clone(),
            claim_key,
            amount: received,
            expiry,
            state: State::Open,
            sealed_note,
        };

        let gift_key = DataKey::Gift(gift_id);
        env.storage().persistent().set(&gift_key, &gift);
        env.storage().persistent().extend_ttl(
            &gift_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        GiftCreated {
            sender,
            token,
            gift_id,
            amount: received,
        }
        .publish(&env);

        Ok(gift_id)
    }

    /// Pays an open gift to `recipient`, authorized by a signature from the gift's claim key.
    pub fn claim(
        env: Env,
        gift_id: u64,
        recipient: Address,
        signature: BytesN<64>,
    ) -> Result<(), VaultError> {
        let relayer: Address = env
            .storage()
            .instance()
            .get(&DataKey::Relayer)
            .ok_or(VaultError::NotInitialized)?;
        relayer.require_auth();

        if Self::is_paused(&env) {
            return Err(VaultError::Paused);
        }

        let gift_key = DataKey::Gift(gift_id);
        let mut gift: Gift = env
            .storage()
            .persistent()
            .get(&gift_key)
            .ok_or(VaultError::GiftNotOpen)?;
        if gift.state != State::Open {
            return Err(VaultError::GiftNotOpen);
        }

        let now = env.ledger().timestamp();
        if now >= gift.expiry {
            return Err(VaultError::GiftExpired);
        }
        if recipient == env.current_contract_address() {
            return Err(VaultError::BadRecipient);
        }

        // Verify claim signature over sha256("viapp:claim:{network}:{contract_id}:{gift_id}:{recipient}")
        let mut msg = Bytes::new(&env);
        msg.append(&Bytes::from_slice(&env, b"viapp:claim:"));
        msg.append(&env.ledger().network_id().into());
        msg.append(&env.current_contract_address().to_string().to_bytes());

        let mut id_bytes = [0u8; 8];
        id_bytes.copy_from_slice(&gift_id.to_be_bytes());
        msg.append(&Bytes::from_slice(&env, &id_bytes));
        msg.append(&recipient.to_string().to_bytes());

        let claim_digest: BytesN<32> = env.crypto().sha256(&msg).into();
        env.crypto()
            .ed25519_verify(&gift.claim_key, &claim_digest.into(), &signature);

        // State change before token transfer (Checks-Effects-Interactions)
        gift.state = State::Claimed;
        env.storage().persistent().set(&gift_key, &gift);
        env.storage().persistent().extend_ttl(
            &gift_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let liab_key = DataKey::Liabilities(gift.token.clone());
        let liabilities: i128 = env.storage().persistent().get(&liab_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&liab_key, &(liabilities - gift.amount));
        env.storage().persistent().extend_ttl(
            &liab_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        let client = token::Client::new(&env, &gift.token);
        client.transfer(&env.current_contract_address(), &recipient, &gift.amount);

        GiftClaimed { gift_id, recipient }.publish(&env);

        Ok(())
    }

    /// Returns an expired, unclaimed gift to its original sender. Unpausable.
    pub fn refund(env: Env, gift_id: u64) -> Result<(), VaultError> {
        let gift_key = DataKey::Gift(gift_id);
        let mut gift: Gift = env
            .storage()
            .persistent()
            .get(&gift_key)
            .ok_or(VaultError::GiftNotOpen)?;
        if gift.state != State::Open {
            return Err(VaultError::GiftNotOpen);
        }

        let now = env.ledger().timestamp();
        if now < gift.expiry {
            return Err(VaultError::GiftNotExpired);
        }

        // State change before token transfer
        gift.state = State::Refunded;
        env.storage().persistent().set(&gift_key, &gift);
        env.storage().persistent().extend_ttl(
            &gift_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );

        let liab_key = DataKey::Liabilities(gift.token.clone());
        let liabilities: i128 = env.storage().persistent().get(&liab_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&liab_key, &(liabilities - gift.amount));
        env.storage().persistent().extend_ttl(
            &liab_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        let client = token::Client::new(&env, &gift.token);
        client.transfer(&env.current_contract_address(), &gift.sender, &gift.amount);

        GiftRefunded {
            gift_id,
            sender: gift.sender,
        }
        .publish(&env);

        Ok(())
    }

    /// Adds or removes a token from the active gifting allowlist. Only callable by admin.
    pub fn set_token_listed(env: Env, token: Address, listed: bool) -> Result<bool, VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        let is_listed_key = DataKey::IsListed(token.clone());
        let currently_listed: bool = env
            .storage()
            .persistent()
            .get(&is_listed_key)
            .unwrap_or(false);

        if currently_listed == listed {
            env.storage().persistent().extend_ttl(
                &is_listed_key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
            env.storage()
                .instance()
                .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
            return Ok(listed);
        }

        let mut tokens: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::ListedTokens)
            .unwrap_or(Vec::new(&env));

        if listed {
            if tokens.len() >= MAX_TOKENS {
                return Err(VaultError::TooManyTokens);
            }
            tokens.push_back(token.clone());
        } else {
            let mut updated = Vec::new(&env);
            for t in tokens.iter() {
                if t != token {
                    updated.push_back(t);
                }
            }
            tokens = updated;
        }

        env.storage().persistent().set(&is_listed_key, &listed);
        env.storage().persistent().extend_ttl(
            &is_listed_key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        env.storage()
            .persistent()
            .set(&DataKey::ListedTokens, &tokens);
        env.storage().persistent().extend_ttl(
            &DataKey::ListedTokens,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        TokenListed { token, listed }.publish(&env);

        Ok(listed)
    }

    /// Rescues tokens sent to the vault outside of `create_gift` (strictly above open gift liabilities).
    pub fn rescue_surplus(env: Env, token: Address, to: Address) -> Result<i128, VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        let client = token::Client::new(&env, &token);
        let balance = client.balance(&env.current_contract_address());
        let owed = Self::liabilities(env.clone(), token.clone());
        if balance <= owed {
            return Err(VaultError::NothingToRescue);
        }
        let surplus = balance - owed;
        client.transfer(&env.current_contract_address(), &to, &surplus);

        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);

        SurplusRescued {
            token,
            to,
            amount: surplus,
        }
        .publish(&env);

        Ok(surplus)
    }

    pub fn get_gift(env: Env, gift_id: u64) -> Option<Gift> {
        env.storage().persistent().get(&DataKey::Gift(gift_id))
    }

    pub fn next_gift_id(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::NextGiftId)
            .unwrap_or(1)
    }

    pub fn admin(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Admin)
    }

    pub fn relayer(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Relayer)
    }

    pub fn liabilities(env: Env, token: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Liabilities(token))
            .unwrap_or(0)
    }

    pub fn listed_tokens(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::ListedTokens)
            .unwrap_or(Vec::new(&env))
    }

    pub fn is_listed(env: &Env, token: &Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::IsListed(token.clone()))
            .unwrap_or(false)
    }

    pub fn is_paused(env: &Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::IsPaused)
            .unwrap_or(false)
    }

    pub fn set_relayer(env: Env, new_relayer: Address) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Relayer, &new_relayer);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        RelayerUpdated { new_relayer }.publish(&env);
        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::IsPaused, &true);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::IsPaused, &false);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        Ok(())
    }

    pub fn extend_ttl(env: Env) -> Result<(), VaultError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::NotInitialized);
        }
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
        if env.storage().persistent().has(&DataKey::ListedTokens) {
            env.storage().persistent().extend_ttl(
                &DataKey::ListedTokens,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        Ok(())
    }
}
