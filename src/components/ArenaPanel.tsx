import { RefreshCw, Swords, Trophy } from 'lucide-react';
import { COVENANT_META, RITE_DEFINITIONS } from '../game/catalog';
import { formatCompactNumber } from '../game/engine';
import type {
  LeaderboardEntry,
  NexusMatch,
  PlayerState,
  ProductionBreakdown,
  RiteId,
} from '../game/types';

interface ArenaPanelProps {
  player: PlayerState;
  production: ProductionBreakdown;
  activeMatch: NexusMatch | null;
  leaderboard: LeaderboardEntry[];
  busyAction: string | null;
  onFindMatch: () => void;
  onPlayRite: (riteId: RiteId) => void;
  onDismissMatch: () => void;
  onRefreshLeaderboard: () => void;
}

const RITE_ORDER: RiteId[] = ['solari_strike', 'terra_guard', 'aether_channel', 'umbri_drain'];

export function ArenaPanel({
  player,
  production,
  activeMatch,
  leaderboard,
  busyAction,
  onFindMatch,
  onPlayRite,
  onDismissMatch,
  onRefreshLeaderboard,
}: ArenaPanelProps) {
  const playerHpPct = activeMatch
    ? Math.max(0, Math.min(100, Math.round((activeMatch.playerHp / activeMatch.playerMaxHp) * 100)))
    : 100;
  const oppHpPct = activeMatch
    ? Math.max(0, Math.min(100, Math.round((activeMatch.opponentHp / activeMatch.opponentMaxHp) * 100)))
    : 100;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#F5F1E6]">
            Outpost Nexus PvP Arena
          </h2>
          <p className="text-sm text-[#9AB0A3] mt-0.5">
            Global cross-platform matchmaking modeled on glimmerfall.online 3v3 Outpost sieges and Light &amp; Void Rites.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-[#C9D8CF]">
          <span>Elo: {player.elo}</span>
          <span aria-hidden="true">·</span>
          <span>Record: {player.wins}W / {player.losses}L</span>
          <span aria-hidden="true">·</span>
          <span>Power: {production.combatPower}</span>
        </div>
      </div>

      {/* Matchmaking / Active Battle Stage */}
      {!activeMatch ? (
        <div className="p-6 rounded-xl bg-[#101B17] border border-[#20342C] flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs font-medium text-[#E6A832]">
              Ranked Cross-Platform Queue · Competitive Parity Enabled
            </div>
            <h3 className="font-display text-xl font-bold text-[#F5F1E6]">
              Challenge Rival Wardens for Nexus Trophies &amp; Void Motes
            </h3>
            <p className="text-sm text-[#A5B7AC] leading-relaxed">
              Each ranked match spans 3 tactical turns. Read your opponent&apos;s Covenant affinity and counter their Rite: Solari Strike breaks Umbri Drain, Terra Guard absorbs Solari Strike, Aether Channel pierces Terra Guard, and Umbri Drain siphons Aether Channel.
            </p>
          </div>

          <button
            type="button"
            onClick={onFindMatch}
            disabled={busyAction !== null}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] font-bold text-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Swords className="w-4 h-4" aria-hidden="true" />
            {busyAction === 'matchmaking' ? 'Searching Queue…' : 'Find Ranked Match'}
          </button>
        </div>
      ) : (
        <div
          data-testid="nexus-duel-board"
          className="p-5 sm:p-6 rounded-xl bg-[#101B17] border border-[#284237] space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E3129] pb-3">
            <div className="text-xs text-[#9AB0A3]">
              Match <span className="font-mono text-[#E9EFEA]">{activeMatch.matchId}</span> ·{' '}
              {activeMatch.isLivePlayer ? 'Live Multiplayer Pairing' : `Ranked Challenger (${activeMatch.opponentRegion})`}
            </div>
            <div className="font-mono text-xs font-semibold tabular-nums text-[#E6A832]">
              {activeMatch.status === 'active'
                ? `Turn ${activeMatch.currentTurn} / ${activeMatch.maxTurns}`
                : `Match Concluded · ${activeMatch.status.toUpperCase()}`}
            </div>
          </div>

          {/* Combatants HP Bars */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-xl bg-[#0B1410] border border-[#1E3129] space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-bold text-[#F5F1E6]">
                    {activeMatch.playerName}
                  </div>
                  <div className="text-xs text-[#8FA497]">
                    {activeMatch.playerCovenant} · Power {activeMatch.playerPower} · Elo {player.elo}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-[#5CE0A4]">
                  HP {activeMatch.playerHp} / {activeMatch.playerMaxHp}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#192822] overflow-hidden">
                <div
                  className="h-full bg-[#2BB673] transition-all duration-200"
                  style={{ width: `${playerHpPct}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0B1410] border border-[#1E3129] space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-bold text-[#F5F1E6]">
                    {activeMatch.opponentName}
                  </div>
                  <div className="text-xs text-[#8FA497]">
                    {activeMatch.opponentCovenant} · Power {activeMatch.opponentPower} · Elo {activeMatch.opponentElo}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-[#E57373]">
                  HP {activeMatch.opponentHp} / {activeMatch.opponentMaxHp}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-[#192822] overflow-hidden">
                <div
                  className="h-full bg-[#D95B5B] transition-all duration-200"
                  style={{ width: `${oppHpPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Rite Selection or End-of-Match Outcome */}
          {activeMatch.status === 'active' ? (
            <div className="space-y-3">
              <div className="text-xs font-medium text-[#C4D3CA]">
                Choose your Covenant Rite for Turn {activeMatch.currentTurn}:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {RITE_ORDER.map((riteId) => {
                  const rite = RITE_DEFINITIONS[riteId];
                  const covMeta = COVENANT_META[rite.covenant];
                  return (
                    <button
                      key={riteId}
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => onPlayRite(riteId)}
                      className="text-left p-3.5 rounded-lg bg-[#0D1713] hover:bg-[#162720] border border-[#243B31] hover:border-[#E6A832] transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                        <span style={{ color: covMeta.accentHex }}>{rite.covenant}</span>
                        <span className="font-mono text-[#9AB0A3]">×{rite.powerMult.toFixed(2)}</span>
                      </div>
                      <div className="font-display text-sm font-bold text-[#F5F1E6]">
                        {rite.name}
                      </div>
                      <p className="text-xs text-[#8FA497] leading-snug">{rite.shortDesc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-[#0B1410] border border-[#E6A832]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-display text-xl font-bold text-[#FFF6DC]">
                  {activeMatch.status === 'victory'
                    ? 'Nexus Outpost Victory'
                    : activeMatch.status === 'draw'
                      ? 'Resonance Stalemate'
                      : 'Nexus Outpost Defeat'}
                </h4>
                <p className="text-xs font-mono tabular-nums text-[#C9D8CF]">
                  Elo {activeMatch.eloDelta >= 0 ? '+' : ''}
                  {activeMatch.eloDelta} · +{formatCompactNumber(activeMatch.rewardShards)} Glimmer Shards · +{activeMatch.rewardVoidMotes} Void Motes · Anchored On-Chain
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onFindMatch}
                  disabled={busyAction !== null}
                  className="px-4 py-2.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold whitespace-nowrap"
                >
                  Play Again
                </button>
                <button
                  type="button"
                  onClick={onDismissMatch}
                  className="px-4 py-2.5 rounded-lg bg-[#192822] hover:bg-[#233830] text-[#E9EFEA] text-xs font-semibold whitespace-nowrap"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Turn Combat Log */}
          {activeMatch.turnLogs.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-[#8FA497]">Duel Chronicle</div>
              <div className="divide-y divide-[#1B2C25] border border-[#1E3129] rounded-lg bg-[#0B1410]">
                {activeMatch.turnLogs.map((log) => (
                  <div
                    key={log.turn}
                    className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                  >
                    <span className="text-[#D4DFD8]">
                      <span className="font-mono text-[#E6A832] mr-2">T{log.turn}</span>
                      {log.note}
                    </span>
                    <span className="font-mono tabular-nums text-[#9AB0A3] shrink-0">
                      Dealt {log.playerDamage} · Took {log.opponentDamage}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Global Ranked Leaderboard */}
      <div className="rounded-xl bg-[#101B17] border border-[#20342C] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1E3129] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-[#E6A832]" aria-hidden="true" />
            <h3 className="font-display text-lg font-bold text-[#F5F1E6]">
              Global Covenant Standings
            </h3>
          </div>
          <button
            type="button"
            onClick={onRefreshLeaderboard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#B4C6BC] border border-[#263C32] hover:text-white hover:border-[#3E6151] transition-colors whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#1D2F28] text-[#879C90]">
                <th className="py-3 px-4 font-medium">Rank</th>
                <th className="py-3 px-4 font-medium">Warden</th>
                <th className="py-3 px-4 font-medium">Covenant</th>
                <th className="py-3 px-4 font-medium text-right">Power</th>
                <th className="py-3 px-4 font-medium text-right">Record</th>
                <th className="py-3 px-4 font-medium text-right">Elo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#182721]">
              {leaderboard.map((row, idx) => {
                const isSelf = row.playerId === player.playerId;
                const covMeta = COVENANT_META[row.covenant];
                return (
                  <tr
                    key={row.playerId}
                    className={isSelf ? 'bg-[#172922]' : 'hover:bg-[#13211C]'}
                  >
                    <td className="py-3 px-4 font-mono tabular-nums text-[#9AB0A3]">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#F5F1E6]">
                      {row.playerName}
                      {isSelf && <span className="ml-2 text-[#E6A832] font-normal">(You)</span>}
                    </td>
                    <td className="py-3 px-4" style={{ color: covMeta.accentHex }}>
                      {row.covenant}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C9D8CF]">
                      {row.combatPower}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#9AB0A3]">
                      {row.wins}W-{row.losses}L
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-[#E6A832]">
                      {row.elo}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
