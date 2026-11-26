/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Compass,
  Pause,
  Play,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trees,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  COVENANT_META,
  DAILY_QUEST_CATALOG,
  ENTITY_CATALOG,
  FOREST_ZONES,
  NFT_SKIN_CATALOG,
} from './game/catalog';
import { verifyChainIntegrity, type ChainVerificationResult } from './game/chain';
import {
  applyIdleTick,
  applyManualHarvest,
  calculateProduction,
  createInitialPlayerState,
  ensureCurrentDailyQuests,
  formatCompactNumber,
  getUtcDateKey,
} from './game/engine';
import type {
  ActiveTab,
  CovenantId,
  GameShellState,
  LeaderboardEntry,
  NexusMatch,
  PlayerState,
  StateBlock,
} from './game/types';
import {
  claimDailyQuestInFirestore,
  ensureTodayDailyQuestsDoc,
  registerOrSyncUserProfile,
  saveDailyQuestProgressToFirestore,
  signInWithGooglePopup,
  signOutFirebase,
  subscribeAuthState,
  subscribeTodayDailyQuests,
  updateUserProfileInFirestore,
} from './firebase';
import {
  commitStateBlock,
  detectClientPlatform,
  fetchEntityRawImages,
  fetchLeaderboard,
  getOrCreateLocalPlayerId,
  joinMatchmaking,
  sendPlayerAction,
  submitMatchTurn,
  syncPlayer,
} from './utils/api';
import { glimmerAudio } from './utils/audio';
import { connectGlimmerWallet } from './utils/wallet';
import { AdminDashboard } from './components/AdminDashboard';
import { ArenaPanel } from './components/ArenaPanel';
import { EntitiesPanel } from './components/EntitiesPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ForestCanvas } from './components/ForestCanvas';
import { LedgerPanel } from './components/LedgerPanel';
import { NftVaultPanel } from './components/NftVaultPanel';
import { QuestsPanel } from './components/QuestsPanel';
import { TitleScreen } from './components/TitleScreen';

function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
}

function shouldAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

export default function App() {
  return (
    <ErrorBoundary>
      {isAdminRoute() ? <AdminDashboard /> : <GlimmerFallGame />}
    </ErrorBoundary>
  );
}

function GlimmerFallGame() {
  const [guestPlayerId] = useState<string>(() => getOrCreateLocalPlayerId());
  const [playerId, setPlayerId] = useState<string>(() => getOrCreateLocalPlayerId());
  const [selectedCovenant, setSelectedCovenant] = useState<CovenantId>('Solari');
  const [gameState, setGameState] = useState<GameShellState>(() =>
    shouldAutostart() ? 'playing' : 'title',
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('forest');
  const [player, setPlayer] = useState<PlayerState>(() =>
    createInitialPlayerState(playerId, 'Warden of the Glade', 'Solari', detectClientPlatform()),
  );
  const [chain, setChain] = useState<StateBlock[]>([]);
  const [chainVerification, setChainVerification] = useState<ChainVerificationResult>(() =>
    verifyChainIntegrity([]),
  );
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [entityImages, setEntityImages] = useState<Record<string, string>>({});
  const [activeEntityImgFallback, setActiveEntityImgFallback] = useState<Record<string, boolean>>({});
  const [activeMatch, setActiveMatch] = useState<NexusMatch | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(false);

  // Firebase Auth & Firestore state
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const pendingTapBatchRef = useRef<number>(0);
  const tapFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firestoreQuestSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedQuestSigRef = useRef<string>('');
  const selectedCovenantRef = useRef<CovenantId>(selectedCovenant);

  useEffect(() => {
    selectedCovenantRef.current = selectedCovenant;
  }, [selectedCovenant]);

  const production = useMemo(() => calculateProduction(player), [player]);

  const claimableQuestCount = useMemo(() => {
    const dq = ensureCurrentDailyQuests(player).dailyQuests;
    return DAILY_QUEST_CATALOG.filter(
      (q) => !dq.claimedQuestIds.includes(q.id) && (dq[q.metric] ?? 0) >= q.target,
    ).length;
  }, [player]);

  // Mirror game state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const applySyncResult = useCallback(
    (res: {
      player?: PlayerState;
      chain?: StateBlock[];
      chainVerification?: ChainVerificationResult;
    }) => {
      if (res?.player?.resources && res.player.activeZoneId) {
        const normalized = ensureCurrentDailyQuests(res.player);
        setPlayer((prev) => {
          const prevDq = ensureCurrentDailyQuests(prev).dailyQuests;
          const nextDq = normalized.dailyQuests;
          const sameDate = prevDq.dateKey === nextDq.dateKey;
          const mergedClaimed = sameDate
            ? Array.from(new Set([...prevDq.claimedQuestIds, ...nextDq.claimedQuestIds]))
            : nextDq.claimedQuestIds;
          const allClaimed = DAILY_QUEST_CATALOG.every((q) => mergedClaimed.includes(q.id));

          return {
            ...normalized,
            dailyQuests: {
              ...nextDq,
              tapsCompleted: sameDate ? Math.max(prevDq.tapsCompleted, nextDq.tapsCompleted) : nextDq.tapsCompleted,
              upgradesCompleted: sameDate
                ? Math.max(prevDq.upgradesCompleted, nextDq.upgradesCompleted)
                : nextDq.upgradesCompleted,
              duelsCompleted: sameDate
                ? Math.max(prevDq.duelsCompleted, nextDq.duelsCompleted)
                : nextDq.duelsCompleted,
              blocksAnchored: sameDate
                ? Math.max(prevDq.blocksAnchored, nextDq.blocksAnchored)
                : nextDq.blocksAnchored,
              claimedQuestIds: mergedClaimed,
              streakCount: sameDate ? Math.max(prevDq.streakCount, nextDq.streakCount) : nextDq.streakCount,
              status: allClaimed ? 'all_claimed' : nextDq.status,
            },
          };
        });
        setSelectedCovenant(normalized.covenant);
      }
      if (Array.isArray(res?.chain)) {
        setChain(res.chain);
      }
      if (res?.chainVerification) {
        setChainVerification(res.chainVerification);
      }
    },
    [],
  );

  // Sync player state with backend low-latency API
  const performSync = useCallback(
    async (opts?: { playerId?: string; playerName?: string; covenant?: CovenantId }) => {
      const targetId = opts?.playerId ?? playerId;
      try {
        const res = await syncPlayer({
          playerId: targetId,
          playerName: opts?.playerName,
          covenant: opts?.covenant,
          platform: detectClientPlatform(),
        });
        applySyncResult(res);
      } catch {
        // Local optimistic progression remains playable even during transient hiccups
      }
    },
    [playerId, applySyncResult],
  );

  const refreshLeaderboard = useCallback(async () => {
    try {
      const res = await fetchLeaderboard();
      setLeaderboard(res.leaderboard);
    } catch {
      // Ignore transient leaderboard fetch errors
    }
  }, []);

  // Load Vercel Blob raw entity images on boot
  useEffect(() => {
    let active = true;
    void fetchEntityRawImages()
      .then((res) => {
        if (active && res?.images) {
          setEntityImages(res.images);
        }
      })
      .catch(() => {
        // Fallback local entity art remains active
      });
    return () => {
      active = false;
    };
  }, []);

  // Subscribe to Firebase Auth state (Google Sign-In & Registration)
  useEffect(() => {
    let questUnsub: (() => void) | null = null;
    let cancelled = false;

    const authUnsub = subscribeAuthState((user) => {
      if (questUnsub) {
        questUnsub();
        questUnsub = null;
      }
      setAuthUser(user);
      setAuthReady(true);

      if (!user) {
        setPlayerId(guestPlayerId);
        void performSync({ playerId: guestPlayerId });
        return;
      }

      void (async () => {
        try {
          const profile = await registerOrSyncUserProfile(
            user,
            selectedCovenantRef.current,
            guestPlayerId,
          );
          if (cancelled) return;

          setPlayerId(profile.playerId);
          setSelectedCovenant(profile.covenant);
          await performSync({
            playerId: profile.playerId,
            playerName: profile.displayName,
            covenant: profile.covenant,
          });

          const todayKey = getUtcDateKey();
          const initialDq = await ensureTodayDailyQuestsDoc(user.uid, todayKey);
          if (cancelled) return;

          setPlayer((prev) => ({
            ...prev,
            dailyQuests: initialDq,
          }));

          questUnsub = subscribeTodayDailyQuests(
            user.uid,
            todayKey,
            (remoteDq) => {
              setPlayer((prev) => {
                const localDq = ensureCurrentDailyQuests(prev, todayKey).dailyQuests;
                const mergedClaimed = Array.from(
                  new Set([...localDq.claimedQuestIds, ...remoteDq.claimedQuestIds]),
                );
                const allClaimed = DAILY_QUEST_CATALOG.every((q) => mergedClaimed.includes(q.id));
                return {
                  ...prev,
                  dailyQuests: {
                    dateKey: todayKey,
                    tapsCompleted: Math.max(localDq.tapsCompleted, remoteDq.tapsCompleted),
                    upgradesCompleted: Math.max(localDq.upgradesCompleted, remoteDq.upgradesCompleted),
                    duelsCompleted: Math.max(localDq.duelsCompleted, remoteDq.duelsCompleted),
                    blocksAnchored: Math.max(localDq.blocksAnchored, remoteDq.blocksAnchored),
                    claimedQuestIds: mergedClaimed,
                    streakCount: Math.max(localDq.streakCount, remoteDq.streakCount),
                    status: allClaimed || remoteDq.status === 'all_claimed' ? 'all_claimed' : 'active',
                  },
                };
              });
            },
            (err) => {
              console.warn('Daily quests listener warning:', err.message);
            },
          );
        } catch (err) {
          if (!cancelled) {
            setAuthError(
              err instanceof Error ? err.message : 'Unable to sync Firebase Warden profile.',
            );
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      authUnsub();
      if (questUnsub) questUnsub();
    };
  }, [guestPlayerId, performSync]);

  // Debounce-persist daily quest metric increments to Firestore when signed in
  useEffect(() => {
    if (!authReady || !authUser) return;
    const dq = ensureCurrentDailyQuests(player).dailyQuests;
    if (dq.status === 'all_claimed') return;

    const sig = `${authUser.uid}:${dq.dateKey}:${dq.tapsCompleted}:${dq.upgradesCompleted}:${dq.duelsCompleted}:${dq.blocksAnchored}`;
    if (sig === lastSavedQuestSigRef.current) return;

    if (firestoreQuestSyncRef.current) clearTimeout(firestoreQuestSyncRef.current);
    firestoreQuestSyncRef.current = setTimeout(() => {
      lastSavedQuestSigRef.current = sig;
      void saveDailyQuestProgressToFirestore(authUser.uid, dq).catch(() => {});
    }, 900);

    return () => {
      if (firestoreQuestSyncRef.current) clearTimeout(firestoreQuestSyncRef.current);
    };
  }, [authReady, authUser, player.dailyQuests]);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  // Real-time 1Hz idle progression loop when actively playing
  useEffect(() => {
    if (gameState !== 'playing') return;
    const id = window.setInterval(() => {
      setPlayer((prev) => applyIdleTick(prev, 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [gameState]);

  // Keyboard shortcuts: Escape / P to pause/resume, M to mute
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'title') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setGameState((prev) => (prev === 'playing' ? 'paused' : 'playing'));
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          glimmerAudio.setMuted(!prev);
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState]);

  const handleGoogleSignIn = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const user = await signInWithGooglePopup();
      showNotice(`Signed in as ${user.displayName || user.email || 'Google Warden'}.`);
    } catch (err) {
      const msg =
        err instanceof Error && err.message.includes('popup-closed-by-user')
          ? 'Google sign-in popup was closed before completing.'
          : err instanceof Error
            ? err.message
            : 'Unable to sign in with Google.';
      setAuthError(msg);
      showNotice(msg);
    } finally {
      setAuthBusy(false);
    }
  }, [showNotice]);

  const handleSignOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOutFirebase();
      showNotice('Signed out of Firebase account.');
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to sign out.');
    } finally {
      setAuthBusy(false);
    }
  }, [showNotice]);

  const handleStartGame = useCallback(() => {
    document.body.dataset.state = 'playing';
    setGameState('playing');
    glimmerAudio.playUpgradeChord();
    void performSync({ covenant: selectedCovenant });
  }, [performSync, selectedCovenant]);

  // Batched low-latency manual harvest sync
  const flushTapBatch = useCallback(() => {
    const count = pendingTapBatchRef.current;
    if (count <= 0) return;
    pendingTapBatchRef.current = 0;
    void sendPlayerAction(playerId, 'harvest', { taps: count })
      .then((res) => {
        applySyncResult(res);
      })
      .catch(() => {});
  }, [playerId, applySyncResult]);

  const handleHarvestTap = useCallback(() => {
    if (gameState !== 'playing') return;
    glimmerAudio.playGlimmerChime();
    setPlayer((prev) => applyManualHarvest(prev, 1).state);
    pendingTapBatchRef.current += 1;
    if (tapFlushTimerRef.current) clearTimeout(tapFlushTimerRef.current);
    tapFlushTimerRef.current = setTimeout(flushTapBatch, 420);
  }, [gameState, flushTapBatch]);

  const runServerAction = useCallback(
    async (actionKey: string, type: string, payload: Record<string, unknown>, successMsg?: string) => {
      setBusyAction(actionKey);
      try {
        const res = await sendPlayerAction(playerId, type, payload);
        applySyncResult(res);
        if (successMsg) showNotice(successMsg);
        return res;
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Action could not be completed.');
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [playerId, showNotice, applySyncResult],
  );

  const handleUpgradeEntity = (entityId: string) => {
    void runServerAction(`entity_${entityId}`, 'upgrade_entity', { entityId }).then((res) => {
      if (res) {
        glimmerAudio.playUpgradeChord();
        showNotice(`Entity upgraded and anchored to Block #${res.chain[res.chain.length - 1]?.blockHeight ?? 1}.`);
      }
    });
  };

  const handleSetActiveEntity = (entityId: string) => {
    void runServerAction(`active_${entityId}`, 'set_active_entity', { entityId }, 'Active forest entity updated.');
  };

  const handleUpgradeProfession = (professionId: string) => {
    void runServerAction(`prof_${professionId}`, 'upgrade_profession', { professionId }).then((res) => {
      if (res) glimmerAudio.playUpgradeChord();
    });
  };

  const handleSelectZone = (zoneId: string) => {
    void runServerAction(`zone_${zoneId}`, 'select_zone', { zoneId }).then((res) => {
      if (res) {
        glimmerAudio.playUpgradeChord();
        const z = FOREST_ZONES.find((item) => item.id === zoneId);
        if (z) showNotice(`Entered ${z.name} (×${z.yieldMultiplier} Resonance).`);
      }
    });
  };

  const handleToggleTcgCard = (cardId: string) => {
    void runServerAction(`tcg_${cardId}`, 'toggle_tcg_card', { cardId }).then((res) => {
      if (res) {
        glimmerAudio.playUpgradeChord();
        showNotice('TCG Resonance Row updated.');
      }
    });
  };

  const handleClaimDailyQuest = async (questId: string) => {
    const res = await runServerAction(`dq_${questId}`, 'claim_daily_quest', { questId });
    if (res) {
      glimmerAudio.playNftMint();
      const quest = DAILY_QUEST_CATALOG.find((q) => q.id === questId);
      showNotice(
        quest
          ? `Claimed "${quest.title}" (+${quest.rewardShards} Shards)!`
          : 'Daily Quest reward claimed!',
      );
      if (authUser) {
        void claimDailyQuestInFirestore(authUser.uid, player.dailyQuests, questId).catch(() => {});
      }
    }
  };

  const handleConnectWallet = async () => {
    setBusyAction('wallet');
    try {
      const result = await connectGlimmerWallet(playerId);
      const res = await sendPlayerAction(playerId, 'link_wallet', { walletAddress: result.address });
      applySyncResult(res);
      glimmerAudio.playNftMint();
      showNotice(`Linked ${result.providerLabel}: ${result.address.slice(0, 8)}…${result.address.slice(-4)}`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to link wallet.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleMintSkin = (skinId: string) => {
    void runServerAction(`mint_${skinId}`, 'mint_skin', { skinId }).then((res) => {
      if (res) {
        glimmerAudio.playNftMint();
        showNotice('NFT Entity Skin minted and equipped on-chain!');
      }
    });
  };

  const handleEquipSkin = (skinId: string) => {
    void runServerAction(`equip_${skinId}`, 'equip_skin', { skinId }, 'NFT Entity Skin equipped.');
  };

  const handleCommitState = async () => {
    setBusyAction('commit');
    try {
      const res = await commitStateBlock(playerId, 'Manual GlimmerChain Anchor');
      applySyncResult(res);
      glimmerAudio.playUpgradeChord();
      showNotice(`Anchored Block #${res.block.blockHeight} · Root ${res.block.stateRoot.slice(0, 10)}…`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'State commitment failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFindMatch = async () => {
    setBusyAction('matchmaking');
    try {
      const res = await joinMatchmaking(playerId);
      setActiveMatch(res.match);
      glimmerAudio.playRiteClash();
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Matchmaking unavailable.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlayRite = async (riteId: Parameters<typeof submitMatchTurn>[2]) => {
    if (!activeMatch) return;
    setBusyAction('turn');
    try {
      const res = await submitMatchTurn(playerId, activeMatch.matchId, riteId);
      setActiveMatch(res.match);
      applySyncResult(res);
      glimmerAudio.playRiteClash();
      if (res.match.status !== 'active') {
        void refreshLeaderboard();
      }
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Unable to resolve turn.');
    } finally {
      setBusyAction(null);
    }
  };

  if (gameState === 'title') {
    return (
      <TitleScreen
        selectedCovenant={selectedCovenant}
        authUser={authUser}
        authBusy={authBusy}
        authError={authError}
        onSelectCovenant={setSelectedCovenant}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onSignOut={() => void handleSignOut()}
        onStart={handleStartGame}
      />
    );
  }

  const activeZone = FOREST_ZONES.find((z) => z.id === player.activeZoneId) ?? FOREST_ZONES[0];
  const activeEntity = ENTITY_CATALOG.find((e) => e.id === player.activeEntityId) ?? ENTITY_CATALOG[0];
  const activeSkin = NFT_SKIN_CATALOG.find((s) => s.id === player.equippedSkinByEntity[activeEntity.id]);
  const activeEntityRemoteUrl = entityImages[activeEntity.id];
  const activeEntityImageSrc =
    activeEntityRemoteUrl && !activeEntityImgFallback[activeEntity.id]
      ? activeEntityRemoteUrl
      : activeEntity.portraitUrl;
  const covMeta = COVENANT_META[player.covenant];
  const latestBlockHeight = chain[chain.length - 1]?.blockHeight ?? 1;

  const navItems: { id: ActiveTab; label: string; shortLabel: string; icon: typeof Trees; badgeCount?: number }[] = [
    { id: 'forest', label: 'Forest', shortLabel: 'Forest', icon: Trees },
    { id: 'entities', label: 'Entities & TCG', shortLabel: 'Entities', icon: Sparkles },
    { id: 'quests', label: 'Daily Quests', shortLabel: 'Quests', icon: ScrollText, badgeCount: claimableQuestCount },
    { id: 'vault', label: 'NFT Vault', shortLabel: 'Vault', icon: Shield },
    { id: 'arena', label: 'Nexus PvP', shortLabel: 'PvP', icon: Swords },
    { id: 'ledger', label: 'Ledger', shortLabel: 'Ledger', icon: Compass },
  ];

  return (
    <div className="min-h-screen bg-[#09110E] text-[#E9EFEA] flex flex-col pb-20 lg:pb-0">
      {/* Compact World-Matched Resource HUD Strip */}
      <div className="sticky top-0 z-30 bg-[#0B1511] border-b border-[#1E3129] px-3 sm:px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0" aria-hidden="true">
              <polygon points="16,2 27,11 22,29 10,29 5,11" fill="#0E1D17" stroke="#E6A832" strokeWidth="1.8" />
              <polygon points="16,6 22,12 16,24 10,12" fill="#E6A832" />
            </svg>
            <div className="min-w-0">
              <div className="font-display text-sm sm:text-base font-bold text-[#F5F1E6] truncate">
                GlimmerFall
              </div>
              <div className="text-[11px] text-[#8FA497] hidden sm:block truncate">
                <span style={{ color: covMeta.accentHex }}>{player.covenant}</span> · Block #{latestBlockHeight}
              </div>
            </div>
          </div>

          {/* Primary Live Resource Readouts */}
          <div className="flex items-center gap-3.5 sm:gap-7 shrink-0">
            <div className="shrink-0">
              <div className="text-[10px] text-[#879C90] tracking-wider whitespace-nowrap">GLIMMER</div>
              <div
                data-testid="hud-glimmer-count"
                className="font-mono text-base sm:text-lg font-bold tabular-nums text-[#F5C75E] leading-tight whitespace-nowrap"
              >
                {formatCompactNumber(player.resources.glimmerShards)}
              </div>
            </div>
            <div className="shrink-0">
              <div className="text-[10px] text-[#879C90] tracking-wider whitespace-nowrap">
                <span className="sm:hidden">RES/S</span>
                <span className="hidden sm:inline">RESONANCE/S</span>
              </div>
              <div className="font-mono text-sm sm:text-base font-semibold tabular-nums text-[#5CE0A4] leading-tight whitespace-nowrap">
                +{production.resonancePerSec.toFixed(1)}
              </div>
            </div>
            <div className="hidden sm:block shrink-0">
              <div className="text-[10px] text-[#879C90] tracking-wider whitespace-nowrap">ESSENCE</div>
              <div className="font-mono text-sm sm:text-base font-semibold tabular-nums text-[#E9EFEA] leading-tight whitespace-nowrap">
                {formatCompactNumber(player.resources.verdantEssence)}
              </div>
            </div>
            <div className="hidden md:block shrink-0">
              <div className="text-[10px] text-[#879C90] tracking-wider whitespace-nowrap">VOID MOTES</div>
              <div className="font-mono text-sm sm:text-base font-semibold tabular-nums text-[#C49BFF] leading-tight whitespace-nowrap">
                {formatCompactNumber(player.resources.voidMotes)}
              </div>
            </div>
          </div>

          {/* Utility Icon Controls (Mute [M], Pause [P]) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              onClick={(e) => {
                e.currentTarget.blur();
                const next = !muted;
                setMuted(next);
                glimmerAudio.setMuted(next);
              }}
              className="w-9 h-9 rounded-lg bg-[#12201B] hover:bg-[#1B3028] border border-[#233830] flex items-center justify-center text-[#B4C6BC] hover:text-white transition-colors"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={gameState === 'paused' ? 'Resume game' : 'Pause game'}
              onClick={(e) => {
                e.currentTarget.blur();
                setGameState((prev) => (prev === 'paused' ? 'playing' : 'paused'));
              }}
              className="w-9 h-9 rounded-lg bg-[#12201B] hover:bg-[#1B3028] border border-[#233830] flex items-center justify-center text-[#B4C6BC] hover:text-white transition-colors"
            >
              {gameState === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop Navigation Rail + Main Game Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col lg:flex-row gap-6">
        <nav
          aria-label="Game realms"
          className="hidden lg:flex flex-col w-52 shrink-0 gap-1.5"
        >
          {navItems.map(({ id, label, icon: Icon, badgeCount }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex items-center justify-between gap-2 px-4 py-3 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#172922] text-[#FFF7E2] border border-[#E6A832]/70'
                    : 'text-[#96ACA0] hover:text-[#F5F1E6] hover:bg-[#101C17] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {label}
                </span>
                {badgeCount && badgeCount > 0 ? (
                  <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#E6A832] text-[#09110E] tabular-nums">
                    {badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="mt-6 pt-5 border-t border-[#1A2B24] space-y-2 px-2 text-xs text-[#7E9488]">
            <div>Active Entity</div>
            <div className="font-display text-sm font-bold text-[#F5F1E6]">{activeEntity.name}</div>
            {activeSkin && <div className="text-[#E6C573]">{activeSkin.name}</div>}
            <div className="font-mono tabular-nums text-[#9AB0A3]">
              Power {production.combatPower} · Elo {player.elo}
            </div>
            {authUser && (
              <div className="pt-2 border-t border-[#1A2B24] text-[11px] text-[#5CE0A4] truncate">
                {authUser.displayName || authUser.email}
              </div>
            )}
          </div>
        </nav>

        <main className="flex-1 min-w-0 space-y-5">
          {notice && (
            <div
              role="status"
              className="px-4 py-2.5 rounded-lg bg-[#14251E] border border-[#2B4B3D] text-xs text-[#E4F0E9]"
            >
              {notice}
            </div>
          )}

          {activeTab === 'forest' && (
            <div className="space-y-6">
              {/* Mystical Forest Canvas + Active Channeling Controls */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                  <div>
                    <div className="text-xs text-[#8FA497]">
                      {activeZone.covenant} Realm · {activeZone.sourceRef} · ×{activeZone.yieldMultiplier} Yield
                    </div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F1E6]">
                      {activeZone.name}
                    </h1>
                  </div>
                  <button
                    type="button"
                    onClick={handleHarvestTap}
                    className="px-5 py-2.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] active:scale-[0.98] text-[#09110E] font-bold text-sm font-mono tabular-nums transition-all whitespace-nowrap self-start sm:self-auto"
                  >
                    Channel Glimmer Node (+{production.clickYield})
                  </button>
                </div>

                <ForestCanvas
                  player={player}
                  production={production}
                  paused={gameState !== 'playing'}
                  onHarvestTap={handleHarvestTap}
                />

                <div className="p-4 rounded-xl bg-[#101B17] border border-[#20342C] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={activeEntityImageSrc}
                      alt={`${activeEntity.name} active forest entity`}
                      referrerPolicy="no-referrer"
                      style={activeSkin ? { filter: activeSkin.portraitFilter } : undefined}
                      onError={() => {
                        if (activeEntityRemoteUrl && !activeEntityImgFallback[activeEntity.id]) {
                          setActiveEntityImgFallback((prev) => ({ ...prev, [activeEntity.id]: true }));
                        }
                      }}
                      className="w-14 h-14 rounded-lg object-cover object-top border border-[#2A4238] shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-[#8FA497]">
                        Active Entity · Lv. {player.entityLevels[activeEntity.id] ?? 1} · {activeEntity.covenant}
                      </div>
                      <div className="font-display text-base font-bold text-[#F5F1E6] truncate">
                        {activeSkin ? activeSkin.name : activeEntity.name}
                      </div>
                      <div className="text-xs font-mono tabular-nums text-[#9AB0A3]">
                        +{production.essencePerClick} Essence/tap · +{production.voidMotesPerMinute} Void/min · Power {production.combatPower}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('entities')}
                      className="px-3.5 py-2 rounded-lg bg-[#182922] hover:bg-[#223A30] text-xs font-semibold text-[#F5F1E6] transition-colors whitespace-nowrap"
                    >
                      Upgrade Entities
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('quests')}
                      className="px-3.5 py-2 rounded-lg border border-[#2B4339] hover:border-[#E6A832] text-xs font-semibold text-[#D6E2DA] hover:text-white transition-colors whitespace-nowrap"
                    >
                      Daily Quests
                    </button>
                  </div>
                </div>
              </div>

              {/* Mystical Forest Zone Selector */}
              <div className="space-y-3">
                <h2 className="font-display text-xl font-bold text-[#F5F1E6]">
                  Mystical Forest Realms
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {FOREST_ZONES.map((zone) => {
                    const unlocked = player.unlockedZoneIds.includes(zone.id);
                    const isCurrent = player.activeZoneId === zone.id;
                    const canUnlock = player.resources.glimmerShards >= zone.unlockCost;
                    const zoneCov = COVENANT_META[zone.covenant];

                    return (
                      <div
                        key={zone.id}
                        className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                          isCurrent
                            ? 'bg-[#15251F] border-[#E6A832]'
                            : 'bg-[#101B17] border-[#20342C]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span style={{ color: zoneCov.accentHex }} className="font-semibold">
                              {zone.covenant}
                            </span>
                            <span className="font-mono tabular-nums text-[#5CE0A4]">
                              ×{zone.yieldMultiplier} Yield
                            </span>
                          </div>
                          <h3 className="font-display text-base font-bold text-[#F5F1E6] mt-1">
                            {zone.name}
                          </h3>
                          <p className="text-xs text-[#9AB0A3] mt-1 leading-relaxed">
                            {zone.description}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectZone(zone.id)}
                          disabled={isCurrent || (!unlocked && !canUnlock) || busyAction !== null}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors whitespace-nowrap ${
                            isCurrent
                              ? 'bg-[#1D3229] text-[#5CE0A4] cursor-default'
                              : unlocked
                                ? 'bg-[#1D3129] hover:bg-[#274338] text-[#F5F1E6]'
                                : canUnlock
                                  ? 'bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E]'
                                  : 'bg-[#172520] text-[#687D71] cursor-not-allowed'
                          }`}
                        >
                          {isCurrent
                            ? 'Active Realm'
                            : unlocked
                              ? 'Travel Here'
                              : `Unlock · ${formatCompactNumber(zone.unlockCost)} Shards`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'entities' && (
            <EntitiesPanel
              player={player}
              entityImages={entityImages}
              busyAction={busyAction}
              onUpgradeEntity={handleUpgradeEntity}
              onSetActiveEntity={handleSetActiveEntity}
              onUpgradeProfession={handleUpgradeProfession}
              onToggleTcgCard={handleToggleTcgCard}
            />
          )}

          {activeTab === 'quests' && (
            <QuestsPanel
              player={player}
              authUser={authUser}
              authBusy={authBusy}
              busyAction={busyAction}
              onClaimQuest={(questId) => void handleClaimDailyQuest(questId)}
              onGoogleSignIn={() => void handleGoogleSignIn()}
            />
          )}

          {activeTab === 'vault' && (
            <NftVaultPanel
              player={player}
              entityImages={entityImages}
              busyAction={busyAction}
              onConnectWallet={handleConnectWallet}
              onMintSkin={handleMintSkin}
              onEquipSkin={handleEquipSkin}
            />
          )}

          {activeTab === 'arena' && (
            <ArenaPanel
              player={player}
              production={production}
              activeMatch={activeMatch}
              leaderboard={leaderboard}
              busyAction={busyAction}
              onFindMatch={handleFindMatch}
              onPlayRite={handlePlayRite}
              onDismissMatch={() => setActiveMatch(null)}
              onRefreshLeaderboard={refreshLeaderboard}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerPanel
              player={player}
              production={production}
              chain={chain}
              chainVerification={chainVerification}
              authUser={authUser}
              authBusy={authBusy}
              busyAction={busyAction}
              onCommitState={handleCommitState}
              onRenameWarden={(name) => {
                void runServerAction('rename', 'rename_warden', { playerName: name }, 'Warden name updated.');
                if (authUser) {
                  void updateUserProfileInFirestore(authUser.uid, { displayName: name }).catch(() => {});
                }
              }}
              onSwitchCovenant={(covenant) => {
                void runServerAction('covenant', 'switch_covenant', { covenant }, `Swore allegiance to ${covenant}.`);
                if (authUser) {
                  void updateUserProfileInFirestore(authUser.uid, { covenant }).catch(() => {});
                }
              }}
              onGoogleSignIn={() => void handleGoogleSignIn()}
              onSignOut={() => void handleSignOut()}
            />
          )}
        </main>
      </div>

      {/* Mobile-First Bottom Thumb Navigation (<= 60px height, 6 compact items with zero overflow on 390px) */}
      <nav
        aria-label="Mobile game navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0B1511] border-t border-[#1E3129] grid grid-cols-6 px-0.5 py-1.5"
      >
        {navItems.map(({ id, shortLabel, icon: Icon, badgeCount }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`relative flex flex-col items-center justify-center py-1 rounded-lg text-[10px] font-medium transition-colors min-h-[44px] ${
                active ? 'text-[#E6A832]' : 'text-[#8FA497]'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-full px-0.5">{shortLabel}</span>
              {badgeCount && badgeCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-[#E6A832]"
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Focused Pause Modal (triggered by Esc / P / Pause button) */}
      {gameState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-modal-title"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-xl bg-[#101B17] border border-[#2B4339] p-6 space-y-5">
            <div>
              <div className="text-xs text-[#E6A832] font-mono">REALM PAUSED</div>
              <h2 id="pause-modal-title" className="font-display text-2xl font-bold text-[#F5F1E6] mt-1">
                GlimmerFall Sanctuary
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[#0A130F] border border-[#1E3129]">
                <div className="text-[#879C90]">Glimmer Shards</div>
                <div className="font-mono text-base font-semibold tabular-nums text-[#F5C75E] mt-0.5">
                  {formatCompactNumber(player.resources.glimmerShards)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#0A130F] border border-[#1E3129]">
                <div className="text-[#879C90]">State Block</div>
                <div className="font-mono text-base font-semibold tabular-nums text-[#5CE0A4] mt-0.5">
                  #{latestBlockHeight}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setGameState('playing')}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] font-bold text-sm"
              >
                Resume Realm
              </button>
              <button
                type="button"
                onClick={() => {
                  setGameState('playing');
                  void handleCommitState();
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-[#182922] hover:bg-[#223A30] text-[#F5F1E6] font-semibold text-sm"
              >
                Save &amp; Anchor On-Chain
              </button>
              <button
                type="button"
                onClick={() => setGameState('title')}
                className="w-full py-2.5 px-4 rounded-lg border border-[#263C32] text-[#A4B6AB] hover:text-white text-sm"
              >
                Return to Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
