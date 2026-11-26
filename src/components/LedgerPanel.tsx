import { useState } from 'react';
import { CheckCircle2, Lock, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import type { User } from 'firebase/auth';
import { COVENANT_META } from '../game/catalog';
import type { ChainVerificationResult } from '../game/chain';
import { formatCompactNumber } from '../game/engine';
import type { CovenantId, PlayerState, ProductionBreakdown, StateBlock } from '../game/types';

interface LedgerPanelProps {
  player: PlayerState;
  production: ProductionBreakdown;
  chain: StateBlock[];
  chainVerification: ChainVerificationResult;
  authUser: User | null;
  authBusy: boolean;
  busyAction: string | null;
  onCommitState: () => void;
  onRenameWarden: (name: string) => void;
  onSwitchCovenant: (covenant: CovenantId) => void;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
}

const COVENANTS: CovenantId[] = ['Solari', 'Terra', 'Aether', 'Umbri'];

export function LedgerPanel({
  player,
  production,
  chain,
  chainVerification,
  authUser,
  authBusy,
  busyAction,
  onCommitState,
  onRenameWarden,
  onSwitchCovenant,
  onGoogleSignIn,
  onSignOut,
}: LedgerPanelProps) {
  const [wardenNameInput, setWardenNameInput] = useState(player.playerName);
  const latestBlock = chain[chain.length - 1] ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#F5F1E6]">
            GlimmerChain State Ledger &amp; Stats
          </h2>
          <p className="text-sm text-[#9AB0A3] mt-0.5">
            Every progression milestone, NFT mint, and Nexus match is cryptographically chained with SHA-256 state roots.
          </p>
        </div>

        <button
          type="button"
          onClick={onCommitState}
          disabled={busyAction !== null}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Lock className="w-4 h-4" aria-hidden="true" />
          {busyAction === 'commit' ? 'Anchoring Block…' : 'Anchor State Block'}
        </button>
      </div>

      {/* Integrity Banner & Cross-Platform Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-xl bg-[#101B17] border border-[#20342C] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {chainVerification.valid ? (
                <CheckCircle2 className="w-5 h-5 text-[#5CE0A4] shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-[#E57373] shrink-0" aria-hidden="true" />
              )}
              <div>
                <h3 className="text-sm font-semibold text-[#F5F1E6]">
                  {chainVerification.valid ? 'Chain Integrity Verified' : 'Chain Integrity Alert'}
                </h3>
                <p className="text-xs text-[#9AB0A3] mt-0.5">{chainVerification.reason}</p>
              </div>
            </div>
            <span className="font-mono text-xs tabular-nums text-[#E6A832] shrink-0">
              Height #{latestBlock?.blockHeight ?? 0}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[#1C2E27]">
            <div>
              <div className="text-xs text-[#879C90]">Resonance/sec</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-[#F5F1E6]">
                {production.resonancePerSec.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#879C90]">Click Power</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-[#F5F1E6]">
                +{production.clickYield}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#879C90]">Lifetime Glimmer</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-[#F5F1E6]">
                {formatCompactNumber(player.resources.totalGlimmerEarned)}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#879C90]">Total Multipliers</div>
              <div className="font-mono text-lg font-semibold tabular-nums text-[#5CE0A4]">
                ×
                {(
                  production.zoneMultiplier *
                  production.tcgMultiplier *
                  production.skinMultiplier *
                  production.mangaMultiplier
                ).toFixed(2)}
              </div>
            </div>
          </div>

          {latestBlock && (
            <div className="p-3 rounded-lg bg-[#0A130F] border border-[#1B2D25] font-mono text-xs text-[#9BB0A3] space-y-1 overflow-x-auto">
              <div>Latest State Root: {latestBlock.stateRoot}</div>
              <div>Latest Block Hash: {latestBlock.blockHash}</div>
              <div>Cross-Platform Sync ID: {player.playerId}</div>
            </div>
          )}
        </div>

        {/* Warden Identity & Covenant */}
        <div className="p-5 rounded-xl bg-[#101B17] border border-[#20342C] space-y-4">
          <h3 className="font-display text-lg font-bold text-[#F5F1E6]">Warden Profile</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (wardenNameInput.trim().length >= 2) {
                onRenameWarden(wardenNameInput.trim());
              }
            }}
            className="space-y-2"
          >
            <label htmlFor="warden-name-input" className="block text-xs text-[#9AB0A3]">
              Display Name
            </label>
            <div className="flex gap-2">
              <input
                id="warden-name-input"
                type="text"
                maxLength={28}
                value={wardenNameInput}
                onChange={(e) => setWardenNameInput(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[#0A130F] border border-[#233830] text-sm text-[#F5F1E6] focus:outline-none focus:border-[#E6A832]"
              />
              <button
                type="submit"
                disabled={busyAction !== null}
                className="px-3.5 py-2 rounded-lg bg-[#1E332A] hover:bg-[#294539] text-xs font-semibold text-[#F5F1E6] whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </form>

          <div className="space-y-2 pt-2 border-t border-[#1C2E27]">
            <div className="text-xs text-[#9AB0A3]">Active Covenant (+10% Entity Synergy)</div>
            <div className="grid grid-cols-2 gap-2">
              {COVENANTS.map((cov) => {
                const active = player.covenant === cov;
                return (
                  <button
                    key={cov}
                    type="button"
                    onClick={() => onSwitchCovenant(cov)}
                    disabled={active || busyAction !== null}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#192C24] border-[#E6A832] text-[#FFF7E2]'
                        : 'bg-[#0B1410] border-[#1F322A] text-[#9AB0A3] hover:text-white'
                    }`}
                  >
                    <span style={{ color: COVENANT_META[cov].accentHex }}>{cov}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-[#1C2E27]">
            <div className="text-xs text-[#9AB0A3]">Firebase Account</div>
            {authUser ? (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#0A130F] border border-[#1F352B]">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#5CE0A4] truncate">
                    {authUser.displayName || 'Google Warden'}
                  </div>
                  <div className="text-[11px] text-[#8FA497] truncate">{authUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={authBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#182922] hover:bg-[#233B31] text-xs font-semibold text-[#DCE6DF] shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={authBusy}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#182922] hover:bg-[#223A30] border border-[#2C483C] text-xs font-semibold text-[#F5F1E6] transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-[#E6A832]" aria-hidden="true" />
                {authBusy ? 'Connecting Google…' : 'Sign in / Register with Google'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Block History Table */}
      <div className="rounded-xl bg-[#101B17] border border-[#20342C] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E3129] flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-[#F5F1E6]">
            Committed State Blocks ({chain.length})
          </h3>
          <span className="text-xs font-mono text-[#8FA497]">SHA-256 + Server HMAC Signed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1D2F28] text-[#879C90]">
                <th className="py-3 px-4 font-medium">Block</th>
                <th className="py-3 px-4 font-medium">Commitment Summary</th>
                <th className="py-3 px-4 font-medium">State Root</th>
                <th className="py-3 px-4 font-medium">Tx Hash</th>
                <th className="py-3 px-4 font-medium text-right">Anchored</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182721]">
              {[...chain].reverse().slice(0, 20).map((b) => (
                <tr key={b.blockHeight} className="hover:bg-[#13211C]">
                  <td className="py-3 px-4 font-mono font-semibold tabular-nums text-[#E6A832]">
                    #{b.blockHeight}
                  </td>
                  <td className="py-3 px-4 text-[#DCE6DF]">{b.summary}</td>
                  <td className="py-3 px-4 font-mono text-[#9AB0A3]">
                    {b.stateRoot.slice(0, 14)}…
                  </td>
                  <td className="py-3 px-4 font-mono text-[#5CE0A4]">
                    {b.txHash.slice(0, 14)}…
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-[#8FA497] whitespace-nowrap">
                    {new Date(b.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
