/*
 * PonsX wallet layer — real Phantom (Solana) integration.
 * Only ever requests the public key (connect) and read-only RPC data
 * (balance, token accounts). Never requests a transaction signature.
 */
const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const STORAGE_KEY = 'ponsx_wallet_pubkey';

const PonsXWallet = {
  publicKey: null,

  getProvider() {
    if ('solana' in window && window.solana?.isPhantom) return window.solana;
    return null;
  },

  isInstalled() {
    return !!this.getProvider();
  },

  async connect({ silent = false } = {}) {
    const provider = this.getProvider();
    if (!provider) throw new Error('PHANTOM_NOT_FOUND');
    const resp = await provider.connect(silent ? { onlyIfTrusted: true } : undefined);
    this.publicKey = resp.publicKey.toString();
    sessionStorage.setItem(STORAGE_KEY, this.publicKey);
    return this.publicKey;
  },

  async disconnect() {
    const provider = this.getProvider();
    if (provider) {
      try { await provider.disconnect(); } catch (_) { /* no-op */ }
    }
    this.publicKey = null;
    sessionStorage.removeItem(STORAGE_KEY);
  },

  getStoredPubkey() {
    return sessionStorage.getItem(STORAGE_KEY);
  },

  onAccountChange(handler) {
    const provider = this.getProvider();
    if (!provider) return;
    provider.on('accountChanged', (pk) => {
      if (pk) {
        this.publicKey = pk.toString();
        sessionStorage.setItem(STORAGE_KEY, this.publicKey);
      } else {
        this.publicKey = null;
        sessionStorage.removeItem(STORAGE_KEY);
      }
      handler(this.publicKey);
    });
    provider.on('disconnect', () => {
      this.publicKey = null;
      sessionStorage.removeItem(STORAGE_KEY);
      handler(null);
    });
  },

  async rpc(method, params) {
    const res = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'RPC_ERROR');
    return json.result;
  },

  async getSolBalance(pubkey) {
    const result = await this.rpc('getBalance', [pubkey]);
    return result.value / 1e9;
  },

  async getTokenAccounts(pubkey) {
    const result = await this.rpc('getTokenAccountsByOwner', [
      pubkey,
      { programId: TOKEN_PROGRAM_ID },
      { encoding: 'jsonParsed' }
    ]);
    return (result.value || [])
      .map(({ account }) => {
        const info = account.data.parsed.info;
        return { mint: info.mint, amount: info.tokenAmount.uiAmount };
      })
      .filter((t) => t.amount && t.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  },

  truncate(pubkey) {
    if (!pubkey) return '';
    return `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
  }
};
