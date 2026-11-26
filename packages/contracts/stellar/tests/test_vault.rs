#![cfg(test)]

use viapp_gift_vault::errors::VaultError;
use viapp_gift_vault::types::State;
use viapp_gift_vault::{GiftVault, GiftVaultClient};

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Bytes, BytesN, Env, IntoVal, Symbol, Vec,
};

fn generate_keypair(seed_byte: u8) -> ([u8; 32], [u8; 32], SigningKey) {
    let seed: [u8; 32] = [seed_byte; 32];
    let signing_key = SigningKey::from_bytes(&seed);
    let verifying_key = signing_key.verifying_key();
    (seed, verifying_key.to_bytes(), signing_key)
}

fn compute_register_proof(
    env: &Env,
    contract_id: &Address,
    sender: &Address,
    signing_key: &SigningKey,
) -> BytesN<64> {
    let mut msg = Bytes::new(env);
    msg.append(&Bytes::from_slice(env, b"viapp:register:"));
    msg.append(&env.ledger().network_id().into());
    msg.append(&contract_id.to_string().to_bytes());
    msg.append(&sender.to_string().to_bytes());
    let digest: BytesN<32> = env.crypto().sha256(&msg).into();

    let mut digest_arr = [0u8; 32];
    digest.copy_into_slice(&mut digest_arr);
    let sig = signing_key.sign(&digest_arr);
    BytesN::from_array(env, &sig.to_bytes())
}

fn compute_claim_sig(
    env: &Env,
    contract_id: &Address,
    gift_id: u64,
    recipient: &Address,
    signing_key: &SigningKey,
) -> BytesN<64> {
    let mut msg = Bytes::new(env);
    msg.append(&Bytes::from_slice(env, b"viapp:claim:"));
    msg.append(&env.ledger().network_id().into());
    msg.append(&contract_id.to_string().to_bytes());

    let mut id_bytes = [0u8; 8];
    id_bytes.copy_from_slice(&gift_id.to_be_bytes());
    msg.append(&Bytes::from_slice(env, &id_bytes));
    msg.append(&recipient.to_string().to_bytes());

    let digest: BytesN<32> = env.crypto().sha256(&msg).into();
    let mut digest_arr = [0u8; 32];
    digest.copy_into_slice(&mut digest_arr);
    let sig = signing_key.sign(&digest_arr);
    BytesN::from_array(env, &sig.to_bytes())
}

#[test]
fn test_constructor_and_view_functions() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());

    let mut tokens = Vec::new(&env);
    tokens.push_back(token_id.address());

    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    assert_eq!(client.listed_tokens().len(), 1);
    assert_eq!(client.is_listed(&token_id.address()), true);
    assert_eq!(client.is_paused(), false);
    assert_eq!(client.next_gift_id(), 1);
    assert_eq!(client.admin(), Some(admin.clone()));
    assert_eq!(client.relayer(), Some(relayer.clone()));

    // Calling initialize again must fail with AlreadyInitialized
    let res = client.try_initialize(&admin, &relayer, &tokens);
    assert_eq!(res, Err(Ok(VaultError::AlreadyInitialized)));
}

#[test]
fn test_pause_unpause_and_admin_auth_tree() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);

    let contract_id = env.register(GiftVault, (&admin, &relayer, &Vec::<Address>::new(&env)));
    let client = GiftVaultClient::new(&env, &contract_id);

    assert_eq!(client.is_paused(), false);
    client.pause();
    assert_eq!(
        env.auths(),
        std::vec![(
            admin.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    Symbol::new(&env, "pause"),
                    Vec::new(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    assert_eq!(client.is_paused(), true);

    client.unpause();
    assert_eq!(client.is_paused(), false);
}

#[test]
fn test_set_token_listed_dynamic_allowlist() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let nvda_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let aapl_sac = env.register_stellar_asset_contract_v2(token_admin.clone());

    let contract_id = env.register(GiftVault, (&admin, &relayer, &Vec::<Address>::new(&env)));
    let client = GiftVaultClient::new(&env, &contract_id);

    assert_eq!(client.listed_tokens().len(), 0);
    assert_eq!(client.is_listed(&nvda_sac.address()), false);

    // Dynamically list NVDA and AAPL
    client.set_token_listed(&nvda_sac.address(), &true);
    assert_eq!(
        env.auths(),
        std::vec![(
            admin.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    contract_id.clone(),
                    Symbol::new(&env, "set_token_listed"),
                    (nvda_sac.address(), true).into_val(&env),
                )),
                sub_invocations: std::vec![],
            }
        )]
    );
    client.set_token_listed(&aapl_sac.address(), &true);

    assert_eq!(client.listed_tokens().len(), 2);
    assert_eq!(client.is_listed(&nvda_sac.address()), true);
    assert_eq!(client.is_listed(&aapl_sac.address()), true);

    // Delist NVDA
    client.set_token_listed(&nvda_sac.address(), &false);
    assert_eq!(client.listed_tokens().len(), 1);
    assert_eq!(client.is_listed(&nvda_sac.address()), false);
    assert_eq!(client.is_listed(&aapl_sac.address()), true);
}

#[test]
fn test_create_gift_and_claim_success_with_auth_verification() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = TokenClient::new(&env, &token_id.address());
    let token_asset_client = StellarAssetClient::new(&env, &token_id.address());

    token_asset_client.mint(&sender, &1_000_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(token_id.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    let (_seed, pubkey, signing_key) = generate_keypair(42);
    let claim_key = BytesN::from_array(&env, &pubkey);
    let key_proof = compute_register_proof(&env, &contract_id, &sender, &signing_key);

    let expiry = 1_000_000 + 86400; // +1 day
    let note = Bytes::from_slice(&env, b"Welcome to viapp!");

    let gift_id = client.create_gift(
        &sender,
        &token_id.address(),
        &500_0000000,
        &claim_key,
        &expiry,
        &note,
        &key_proof,
    );

    // Verify outer-layer sender.require_auth() + nested token.transfer auth tree
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, sender);

    assert_eq!(gift_id, 1);
    assert_eq!(client.next_gift_id(), 2);
    assert_eq!(client.liabilities(&token_id.address()), 500_0000000);
    assert_eq!(token_client.balance(&contract_id), 500_0000000);
    assert_eq!(token_client.balance(&sender), 500_0000000);

    let gift = client.get_gift(&gift_id).unwrap();
    assert_eq!(gift.state, State::Open);
    assert_eq!(gift.amount, 500_0000000);

    // Claim gift via authorized relayer
    let claim_sig = compute_claim_sig(&env, &contract_id, gift_id, &recipient, &signing_key);
    client.claim(&gift_id, &recipient, &claim_sig);

    let claim_auths = env.auths();
    assert_eq!(claim_auths.len(), 1);
    assert_eq!(claim_auths[0].0, relayer);

    assert_eq!(token_client.balance(&recipient), 500_0000000);
    assert_eq!(client.liabilities(&token_id.address()), 0);

    let claimed_gift = client.get_gift(&gift_id).unwrap();
    assert_eq!(claimed_gift.state, State::Claimed);
}

#[test]
fn test_negative_security_guards_and_error_paths() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let listed_token = env.register_stellar_asset_contract_v2(token_admin.clone());
    let unlisted_token = env.register_stellar_asset_contract_v2(token_admin.clone());
    StellarAssetClient::new(&env, &listed_token.address()).mint(&sender, &1_000_0000000);
    StellarAssetClient::new(&env, &unlisted_token.address()).mint(&sender, &1_000_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(listed_token.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    let (_seed, pubkey, signing_key) = generate_keypair(7);
    let claim_key = BytesN::from_array(&env, &pubkey);
    let key_proof = compute_register_proof(&env, &contract_id, &sender, &signing_key);
    let valid_expiry = 1_000_000 + 86400;
    let note = Bytes::from_slice(&env, b"Test");

    // 1. Unlisted token must fail with TokenNotListed
    let res_unlisted = client.try_create_gift(
        &sender,
        &unlisted_token.address(),
        &100_0000000,
        &claim_key,
        &valid_expiry,
        &note,
        &key_proof,
    );
    assert_eq!(res_unlisted, Err(Ok(VaultError::TokenNotListed)));

    // 2. Zero or negative amount must fail with ZeroAmount
    let res_zero = client.try_create_gift(
        &sender,
        &listed_token.address(),
        &0,
        &claim_key,
        &valid_expiry,
        &note,
        &key_proof,
    );
    assert_eq!(res_zero, Err(Ok(VaultError::ZeroAmount)));

    // 3. Expiry < MIN_LIFETIME (3600s) or > MAX_LIFETIME (90d) must fail with ExpiryOutOfRange
    let res_short_expiry = client.try_create_gift(
        &sender,
        &listed_token.address(),
        &100_0000000,
        &claim_key,
        &(1_000_000 + 60),
        &note,
        &key_proof,
    );
    assert_eq!(res_short_expiry, Err(Ok(VaultError::ExpiryOutOfRange)));

    // 4. Create valid gift
    let gift_id = client.create_gift(
        &sender,
        &listed_token.address(),
        &100_0000000,
        &claim_key,
        &valid_expiry,
        &note,
        &key_proof,
    );

    // 5. Reusing the same claim_key must fail with ClaimKeyAlreadyUsed
    let res_reuse_key = client.try_create_gift(
        &sender,
        &listed_token.address(),
        &100_0000000,
        &claim_key,
        &valid_expiry,
        &note,
        &key_proof,
    );
    assert_eq!(res_reuse_key, Err(Ok(VaultError::ClaimKeyAlreadyUsed)));

    // 6. Refunding before expiry must fail with GiftNotExpired
    let res_early_refund = client.try_refund(&gift_id);
    assert_eq!(res_early_refund, Err(Ok(VaultError::GiftNotExpired)));

    // 7. Claiming to contract address itself must fail with BadRecipient
    let self_sig = compute_claim_sig(&env, &contract_id, gift_id, &contract_id, &signing_key);
    let res_self_claim = client.try_claim(&gift_id, &contract_id, &self_sig);
    assert_eq!(res_self_claim, Err(Ok(VaultError::BadRecipient)));

    // 8. Claiming after expiry must fail with GiftExpired
    env.ledger().set_timestamp(valid_expiry + 1);
    let valid_sig = compute_claim_sig(&env, &contract_id, gift_id, &recipient, &signing_key);
    let res_expired_claim = client.try_claim(&gift_id, &recipient, &valid_sig);
    assert_eq!(res_expired_claim, Err(Ok(VaultError::GiftExpired)));
}

#[test]
fn test_rescue_surplus_protects_open_gift_liabilities() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = TokenClient::new(&env, &token_id.address());
    let token_asset_client = StellarAssetClient::new(&env, &token_id.address());

    token_asset_client.mint(&sender, &500_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(token_id.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    let (_seed, pubkey, signing_key) = generate_keypair(19);
    let claim_key = BytesN::from_array(&env, &pubkey);
    let key_proof = compute_register_proof(&env, &contract_id, &sender, &signing_key);

    client.create_gift(
        &sender,
        &token_id.address(),
        &300_0000000,
        &claim_key,
        &(1_000_000 + 86400),
        &Bytes::from_slice(&env, b"Protected"),
        &key_proof,
    );

    // No surplus exists yet — rescue_surplus must fail with NothingToRescue
    assert_eq!(
        client.try_rescue_surplus(&token_id.address(), &admin),
        Err(Ok(VaultError::NothingToRescue))
    );

    // Accidental direct transfer of 50 tokens to contract
    token_client.transfer(&sender, &contract_id, &50_0000000);
    assert_eq!(token_client.balance(&contract_id), 350_0000000);

    // Rescue surplus only moves the 50 excess tokens, leaving 300 in liabilities intact
    let rescued = client.rescue_surplus(&token_id.address(), &admin);
    assert_eq!(rescued, 50_0000000);
    assert_eq!(token_client.balance(&contract_id), 300_0000000);
    assert_eq!(token_client.balance(&admin), 50_0000000);
}

#[test]
fn test_refund_expired_success() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = TokenClient::new(&env, &token_id.address());
    let token_asset_client = StellarAssetClient::new(&env, &token_id.address());

    token_asset_client.mint(&sender, &1_000_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(token_id.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    let (_seed, pubkey, signing_key) = generate_keypair(42);
    let claim_key = BytesN::from_array(&env, &pubkey);
    let key_proof = compute_register_proof(&env, &contract_id, &sender, &signing_key);

    let expiry = 1_000_000 + 86400; // +1 day
    let note = Bytes::from_slice(&env, b"Expired Gift");

    let gift_id = client.create_gift(
        &sender,
        &token_id.address(),
        &300_0000000,
        &claim_key,
        &expiry,
        &note,
        &key_proof,
    );

    // Fast-forward past expiry
    env.ledger().set_timestamp(expiry + 100);

    // Refund
    client.refund(&gift_id);

    assert_eq!(token_client.balance(&sender), 1_000_0000000);
    assert_eq!(client.liabilities(&token_id.address()), 0);

    let refunded_gift = client.get_gift(&gift_id).unwrap();
    assert_eq!(refunded_gift.state, State::Refunded);
}

#[test]
fn test_unpausable_refund() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_client = TokenClient::new(&env, &token_id.address());
    let token_asset_client = StellarAssetClient::new(&env, &token_id.address());

    token_asset_client.mint(&sender, &1_000_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(token_id.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    let (_seed, pubkey, signing_key) = generate_keypair(42);
    let claim_key = BytesN::from_array(&env, &pubkey);
    let key_proof = compute_register_proof(&env, &contract_id, &sender, &signing_key);

    let expiry = 1_000_000 + 86400; // +1 day
    let note = Bytes::from_slice(&env, b"Will refund during pause");

    let gift_id = client.create_gift(
        &sender,
        &token_id.address(),
        &400_0000000,
        &claim_key,
        &expiry,
        &note,
        &key_proof,
    );

    // Pause contract
    client.pause();
    assert_eq!(client.is_paused(), true);

    // Fast-forward past expiry
    env.ledger().set_timestamp(expiry + 100);

    // Refund MUST succeed even when paused!
    client.refund(&gift_id);

    assert_eq!(token_client.balance(&sender), 1_000_0000000);
    let refunded_gift = client.get_gift(&gift_id).unwrap();
    assert_eq!(refunded_gift.state, State::Refunded);
}

#[test]
fn test_multi_venue_tokenized_stocks_and_liabilities() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000_000);

    let admin = Address::generate(&env);
    let relayer = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let bstock_admin = Address::generate(&env);
    let stock2_admin = Address::generate(&env);
    let bstock_id = env.register_stellar_asset_contract_v2(bstock_admin.clone());
    let stock2_id = env.register_stellar_asset_contract_v2(stock2_admin.clone());

    let bstock_client = TokenClient::new(&env, &bstock_id.address());
    let bstock_asset = StellarAssetClient::new(&env, &bstock_id.address());
    let stock2_client = TokenClient::new(&env, &stock2_id.address());
    let stock2_asset = StellarAssetClient::new(&env, &stock2_id.address());

    bstock_asset.mint(&sender, &500_0000000);
    stock2_asset.mint(&sender, &500_0000000);

    let mut tokens = Vec::new(&env);
    tokens.push_back(bstock_id.address());
    tokens.push_back(stock2_id.address());
    let contract_id = env.register(GiftVault, (&admin, &relayer, &tokens));
    let client = GiftVaultClient::new(&env, &contract_id);

    assert_eq!(client.listed_tokens().len(), 2);
    assert_eq!(client.is_listed(&bstock_id.address()), true);
    assert_eq!(client.is_listed(&stock2_id.address()), true);

    let (_seed1, pubkey1, signing_key1) = generate_keypair(42);
    let claim_key1 = BytesN::from_array(&env, &pubkey1);
    let key_proof1 = compute_register_proof(&env, &contract_id, &sender, &signing_key1);
    let expiry1 = 1_000_000 + 86400;
    let note1 = Bytes::from_slice(&env, b"Gift of AAPL stock");

    let gift_id1 = client.create_gift(
        &sender,
        &bstock_id.address(),
        &100_0000000,
        &claim_key1,
        &expiry1,
        &note1,
        &key_proof1,
    );

    let (_seed2, pubkey2, signing_key2) = generate_keypair(88);
    let claim_key2 = BytesN::from_array(&env, &pubkey2);
    let key_proof2 = compute_register_proof(&env, &contract_id, &sender, &signing_key2);
    let expiry2 = 1_000_000 + 86400;
    let note2 = Bytes::from_slice(&env, b"Gift of NVDA stock");

    let gift_id2 = client.create_gift(
        &sender,
        &stock2_id.address(),
        &200_0000000,
        &claim_key2,
        &expiry2,
        &note2,
        &key_proof2,
    );

    assert_eq!(client.liabilities(&bstock_id.address()), 100_0000000);
    assert_eq!(client.liabilities(&stock2_id.address()), 200_0000000);

    let claim_sig1 = compute_claim_sig(&env, &contract_id, gift_id1, &recipient, &signing_key1);
    client.claim(&gift_id1, &recipient, &claim_sig1);

    assert_eq!(bstock_client.balance(&recipient), 100_0000000);
    assert_eq!(client.liabilities(&bstock_id.address()), 0);
    assert_eq!(client.liabilities(&stock2_id.address()), 200_0000000);

    env.ledger().set_timestamp(expiry2 + 100);
    client.refund(&gift_id2);

    assert_eq!(stock2_client.balance(&sender), 500_0000000);
    assert_eq!(client.liabilities(&stock2_id.address()), 0);
}
