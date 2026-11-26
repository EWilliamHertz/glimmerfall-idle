import { CheckCircle2, Flame, LogIn, ScrollText } from 'lucide-react';
import type { User } from 'firebase/auth';
import { DAILY_QUEST_CATALOG } from '../game/catalog';
import { ensureCurrentDailyQuests, formatCompactNumber } from '../game/engine';
import type { PlayerState } from '../game/types';

interface QuestsPanelProps {
  player: PlayerState;
  authUser: User | null;
  authBusy: boolean;
  busyAction: string | null;
  onClaimQuest: (questId: string) => void;
  onGoogleSignIn: () => void;
}

export function QuestsPanel({
  player,
  authUser,
  authBusy,
  busyAction,
  onClaimQuest,
  onGoogleSignIn,
}: QuestsPanelProps) {
  const normalized = ensureCurrentDailyQuests(player);
  const dq = normalized.dailyQuests;
  const claimedCount = dq.claimedQuestIds.length;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#F5F1E6]">
            Daily Covenant Quests
          </h2>
          <p className="text-sm text-[#9AB0A3] mt-0.5">
            Complete daily objectives across GlimmerFall realms to earn Shards, Essence, and Void Motes. Resets at 00:00 UTC.
          </p>
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl bg-[#101B17] border border-[#20342C] self-start sm:self-auto shrink-0 whitespace-nowrap">
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <Flame className="w-4 h-4 text-[#E6A832] shrink-0" aria-hidden="true" />
            <span className="text-[#8FA497]">Streak</span>
            <span className="font-mono font-bold tabular-nums text-[#F5C75E]">
              {dq.streakCount}d
            </span>
          </div>
          <div className="h-4 w-px bg-[#20342C] shrink-0" aria-hidden="true" />
          <div className="text-xs font-mono tabular-nums text-[#5CE0A4] whitespace-nowrap">
            {claimedCount}/{DAILY_QUEST_CATALOG.length} Claimed · {dq.dateKey}
          </div>
        </div>
      </div>

      {/* Firebase Google Sync Banner */}
      <div className="p-4 rounded-xl bg-[#0F1B16] border border-[#20342C] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ScrollText className="w-5 h-5 text-[#E6A832] shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[#F5F1E6]">
              {authUser
                ? `Synced to Firebase Account (${authUser.email ?? authUser.displayName ?? 'Google Warden'})`
                : 'Sign in with Google to save Daily Quest streaks across devices'}
            </div>
            <p className="text-xs text-[#9AB0A3] mt-0.5">
              {authUser
                ? 'Your daily quest progress, streak count, and Warden profile are stored in Firestore.'
                : 'Guest progress is tracked locally for this session. Register or sign in with Google anytime.'}
            </p>
          </div>
        </div>

        {!authUser && (
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={authBusy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold transition-colors whitespace-nowrap self-start sm:self-auto"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            {authBusy ? 'Signing In…' : 'Sign in with Google'}
          </button>
        )}
      </div>

      {/* Daily Quest Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DAILY_QUEST_CATALOG.map((quest) => {
          const current = Math.min(quest.target, dq[quest.metric] ?? 0);
          const pct = Math.min(100, Math.round((current / quest.target) * 100));
          const isClaimed = dq.claimedQuestIds.includes(quest.id);
          const isReady = current >= quest.target && !isClaimed;

          return (
            <article
              key={quest.id}
              data-testid={`daily-quest-${quest.id}`}
              className={`p-5 rounded-xl border flex flex-col justify-between gap-4 ${
                isReady
                  ? 'bg-[#15251F] border-[#E6A832]'
                  : isClaimed
                    ? 'bg-[#0D1713] border-[#1F352B]'
                    : 'bg-[#101B17] border-[#20342C]'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#8FA497]">{quest.sourceRef}</span>
                  <span className="font-mono tabular-nums text-[#E6C573]">
                    {current} / {quest.target}
                  </span>
                </div>

                <h3 className="font-display text-lg font-bold text-[#F5F1E6]">{quest.title}</h3>
                <p className="text-xs text-[#A5B7AC] leading-relaxed">{quest.description}</p>

                {/* Progress Bar */}
                <div className="w-full h-2 rounded-full bg-[#09120E] overflow-hidden border border-[#1E3129]">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isClaimed || isReady ? 'bg-[#2BB673]' : 'bg-[#E6A832]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1C2E27]">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[#C9D8CF]">
                  <span className="text-[#F5C75E]">+{formatCompactNumber(quest.rewardShards)} Shards</span>
                  {quest.rewardEssence > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#5CE0A4]">+{quest.rewardEssence} Essence</span>
                    </>
                  )}
                  {quest.rewardVoidMotes > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#C49BFF]">+{quest.rewardVoidMotes} Void</span>
                    </>
                  )}
                </div>

                {isClaimed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5CE0A4]">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                    Claimed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onClaimQuest(quest.id)}
                    disabled={!isReady || busyAction !== null}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      isReady
                        ? 'bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E]'
                        : 'bg-[#192822] text-[#6A7F73] cursor-not-allowed'
                    }`}
                  >
                    {isReady ? 'Claim Reward' : 'In Progress'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
