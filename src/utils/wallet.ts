import { sha256Hex } from '../game/chain';

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface WalletConnectResult {
  address: string;
  mode: 'eip1193' | 'glimmer_passkey';
  providerLabel: string;
}

export async function connectGlimmerWallet(playerId: string): Promise<WalletConnectResult> {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (eth && typeof eth.request === 'function') {
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      if (Array.isArray(accounts) && typeof accounts[0] === 'string' && /^0x[a-fA-F0-9]{40}$/.test(accounts[0])) {
        return {
          address: accounts[0],
          mode: 'eip1193',
          providerLabel: 'Web3 Wallet (EIP-1193)',
        };
      }
    } catch {
      // User dismissed wallet or no accounts returned; fall through to deterministic GlimmerChain vault key
    }
  }

  // Deterministic cross-platform GlimmerChain smart-vault address derived from playerId
  const derivedHex = sha256Hex(`glimmerfall-vault-v1|${playerId}`).slice(0, 40);
  return {
    address: `0x${derivedHex}`,
    mode: 'glimmer_passkey',
    providerLabel: 'GlimmerChain Cross-Platform Vault',
  };
}
