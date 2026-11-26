import {
  ARTISAN_PROFESSIONS,
  COVENANT_META,
  DAILY_QUEST_CATALOG,
  ENTITY_CATALOG,
  FOREST_ZONES,
  MANGA_CHAPTERS,
  NFT_SKIN_CATALOG,
  RITE_DEFINITIONS,
  TCG_CARDS,
} from './catalog';
import type {
  CovenantId,
  DailyQuestProgress,
  DuelTurnLog,
  NexusMatch,
  PlayerState,
  ProductionBreakdown,
  RiteId,
} from './types';

export function getUtcDateKey(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function createInitialDailyQuestProgress(
  dateKey = getUtcDateKey(),
  streakCount = 0,
): DailyQuestProgress {
  return {
    dateKey,
    tapsCompleted: 0,
    upgradesCompleted: 0,
    duelsCompleted: 0,
    blocksAnchored: 0,
    claimedQuestIds: [],
    streakCount,
    status: 'active',
  };
}

export function ensureCurrentDailyQuests(
  state: PlayerState,
  todayKey = getUtcDateKey(),
): PlayerState {
  const current = state.dailyQuests;
  if (current && current.dateKey === todayKey) {
    return state;
  }
  const keepStreak = current && current.status === 'all_claimed' ? current.streakCount : 0;
  return {
    ...state,
    dailyQuests: createInitialDailyQuestProgress(todayKey, keepStreak),
  };
}

export function createInitialPlayerState(
  playerId: string,
  playerName = 'Warden of the Glade',
  covenant: CovenantId = 'Solari',
  platform: 'desktop' | 'mobile' | 'tablet' = 'desktop',
): PlayerState {
  return {
    playerId,
    playerName,
    covenant,
    walletAddress: null,
    platform,
    resources: {
      glimmerShards: 30,
      totalGlimmerEarned: 30,
      verdantEssence: 10,
      voidMotes: 2,
      nexusTrophies: 0,
    },
    entityLevels: {
      solari_vanguard: 1,
      ancient_moss_drake: 0,
      mind_sculptor: 0,
      void_gate_warden: 0,
      sunspear_adept: 0,
      aurora_marshal: 0,
    },
    professionLevels: {
      herbalism: 1,
      runecraft: 1,
      void_alchemy: 0,
      siege_forging: 0,
    },
    activeZoneId: 'verdant_root_canopy',
    unlockedZoneIds: ['verdant_root_canopy'],
    unlockedTcgCardIds: ['judgement_of_the_sun'],
    equippedResonanceRow: ['judgement_of_the_sun'],
    ownedSkinIds: [],
    equippedSkinByEntity: {},
    activeEntityId: 'solari_vanguard',
    dailyQuests: createInitialDailyQuestProgress(),
    elo: 1000,
    wins: 0,
    losses: 0,
    totalClicks: 0,
    lastUpdatedAt: Date.now(),
    stateVersion: 1,
  };
}

export function getEntityUpgradeCost(entityId: string, currentLevel: number): number {
  const entity = ENTITY_CATALOG.find((e) => e.id === entityId);
  if (!entity) return Number.POSITIVE_INFINITY;
  return Math.floor(entity.baseCost * Math.pow(entity.costMultiplier, currentLevel));
}

export function getProfessionUpgradeCost(professionId: string, currentLevel: number): number {
  const prof = ARTISAN_PROFESSIONS.find((p) => p.id === professionId);
  if (!prof) return Number.POSITIVE_INFINITY;
  return Math.floor(prof.baseCost * Math.pow(1.24, currentLevel));
}

export function getUnlockedMangaChapters(totalGlimmerEarned: number) {
  return MANGA_CHAPTERS.filter((ch) => totalGlimmerEarned >= ch.unlockTotalGlimmer);
}

export function calculateProduction(state: PlayerState | null | undefined): ProductionBreakdown {
  if (!state || !state.resources) {
    return {
      resonancePerSec: 1,
      clickYield: 2,
      essencePerClick: 1,
      voidMotesPerMinute: 0.8,
      combatPower: 40,
      zoneMultiplier: 1,
      tcgMultiplier: 1,
      skinMultiplier: 1,
      mangaMultiplier: 1,
      professionMultiplier: 1,
    };
  }
  const zone = FOREST_ZONES.find((z) => z.id === state.activeZoneId) ?? FOREST_ZONES[0];
  const entityLevels = state.entityLevels ?? {};
  const professionLevels = state.professionLevels ?? {};
  const equippedResonanceRow = Array.isArray(state.equippedResonanceRow)
    ? state.equippedResonanceRow
    : [];
  const equippedSkinByEntity = state.equippedSkinByEntity ?? {};
  const ownedSkinIds = Array.isArray(state.ownedSkinIds) ? state.ownedSkinIds : [];

  let baseResPerSec = 0;
  let baseClick = 2;
  let baseCombat = 40;

  for (const entity of ENTITY_CATALOG) {
    const lv = entityLevels[entity.id] ?? 0;
    if (lv > 0) {
      const covenantSynergy = entity.covenant === state.covenant ? 1.1 : 1.0;
      baseResPerSec += entity.baseResonancePerSec * lv * covenantSynergy;
      baseClick += entity.baseClickPower * lv * 0.65;
      baseCombat += entity.baseCombatPower * Math.pow(lv, 0.88) * covenantSynergy;
    }
  }

  let tcgIdleBonus = 0;
  let tcgClickBonus = 0;
  let tcgPvpBonus = 0;
  for (const cardId of equippedResonanceRow) {
    const card = TCG_CARDS.find((c) => c.id === cardId);
    if (card) {
      tcgIdleBonus += card.idleMultiplierBonus;
      tcgClickBonus += card.clickMultiplierBonus;
      tcgPvpBonus += card.pvpPowerBonus;
    }
  }

  let skinProdBonus = 0;
  let skinPvpBonus = 0;
  for (const skinId of Object.values(equippedSkinByEntity)) {
    const skin = NFT_SKIN_CATALOG.find((s) => s.id === skinId);
    if (skin && ownedSkinIds.includes(skin.id)) {
      skinProdBonus += skin.productionBonus;
      skinPvpBonus += skin.pvpBonus;
    }
  }

  const unlockedChapters = getUnlockedMangaChapters(state.resources.totalGlimmerEarned ?? 0);
  const mangaBonusPct = unlockedChapters.reduce((acc, ch) => acc + ch.passiveBonusPct, 0);
  const mangaMultiplier = 1 + mangaBonusPct / 100;

  const herbLv = professionLevels.herbalism ?? 0;
  const runeLv = professionLevels.runecraft ?? 0;
  const voidLv = professionLevels.void_alchemy ?? 0;
  const siegeLv = professionLevels.siege_forging ?? 0;

  const professionMultiplier = 1 + herbLv * 0.06;
  const clickProfMultiplier = 1 + runeLv * 0.08;
  const pvpProfMultiplier = 1 + siegeLv * 0.05;

  const zoneMultiplier = zone.yieldMultiplier;
  const tcgMultiplier = 1 + tcgIdleBonus;
  const skinMultiplier = 1 + skinProdBonus;

  const resonancePerSec = Math.max(
    1,
    Math.round(
      baseResPerSec * zoneMultiplier * tcgMultiplier * skinMultiplier * mangaMultiplier * professionMultiplier * 10,
    ) / 10,
  );

  const clickYield = Math.max(
    2,
    Math.round(
      baseClick * zoneMultiplier * (1 + tcgClickBonus) * skinMultiplier * clickProfMultiplier,
    ),
  );

  const essencePerClick = Math.max(1, Math.round(zone.essenceBonusPerClick * (1 + runeLv * 0.06)));
  const voidMotesPerMinute = Math.round(
    (0.8 + voidLv * 0.55 + (state.activeZoneId === 'void_touched_bramble' ? 1.5 : 0)) * 10,
  ) / 10;
  const combatPower = Math.round((baseCombat + tcgPvpBonus + skinPvpBonus) * pvpProfMultiplier);

  return {
    resonancePerSec,
    clickYield,
    essencePerClick,
    voidMotesPerMinute,
    combatPower,
    zoneMultiplier,
    tcgMultiplier,
    skinMultiplier,
    mangaMultiplier,
    professionMultiplier,
  };
}

export function applyIdleTick(state: PlayerState, elapsedSec: number): PlayerState {
  if (!state || !state.resources) return state;
  const clampedSec = Math.max(0, Math.min(elapsedSec, 3600));
  if (clampedSec <= 0) return state;

  const prod = calculateProduction(state);
  const gainedShards = prod.resonancePerSec * clampedSec;
  const gainedEssence = prod.essencePerClick * 0.12 * clampedSec;
  const gainedVoid = (prod.voidMotesPerMinute / 60) * clampedSec;

  return {
    ...state,
    resources: {
      ...state.resources,
      glimmerShards: state.resources.glimmerShards + gainedShards,
      totalGlimmerEarned: state.resources.totalGlimmerEarned + gainedShards,
      verdantEssence: state.resources.verdantEssence + gainedEssence,
      voidMotes: state.resources.voidMotes + gainedVoid,
    },
    lastUpdatedAt: Date.now(),
  };
}

export function applyManualHarvest(
  rawState: PlayerState,
  taps = 1,
): { state: PlayerState; gainedShards: number; gainedEssence: number } {
  const state = ensureCurrentDailyQuests(rawState);
  const safeTaps = Math.max(1, Math.min(Math.floor(taps), 25));
  const prod = calculateProduction(state);
  const gainedShards = prod.clickYield * safeTaps;
  const gainedEssence = prod.essencePerClick * safeTaps;

  return {
    gainedShards,
    gainedEssence,
    state: {
      ...state,
      totalClicks: state.totalClicks + safeTaps,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      dailyQuests: {
        ...state.dailyQuests,
        tapsCompleted: state.dailyQuests.tapsCompleted + safeTaps,
      },
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards + gainedShards,
        totalGlimmerEarned: state.resources.totalGlimmerEarned + gainedShards,
        verdantEssence: state.resources.verdantEssence + gainedEssence,
      },
    },
  };
}

export function upgradeEntity(
  rawState: PlayerState,
  entityId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const state = ensureCurrentDailyQuests(rawState);
  const entity = ENTITY_CATALOG.find((e) => e.id === entityId);
  if (!entity) return { ok: false, error: 'Unknown GlimmerFall entity.', state };

  const currentLevel = state.entityLevels[entityId] ?? 0;
  const cost = getEntityUpgradeCost(entityId, currentLevel);
  if (state.resources.glimmerShards < cost) {
    return { ok: false, error: `Requires ${cost} Glimmer Shards.`, state };
  }

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      activeEntityId: currentLevel === 0 ? entityId : state.activeEntityId,
      dailyQuests: {
        ...state.dailyQuests,
        upgradesCompleted: state.dailyQuests.upgradesCompleted + 1,
      },
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards - cost,
      },
      entityLevels: {
        ...state.entityLevels,
        [entityId]: currentLevel + 1,
      },
    },
  };
}

export function upgradeProfession(
  rawState: PlayerState,
  professionId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const state = ensureCurrentDailyQuests(rawState);
  const prof = ARTISAN_PROFESSIONS.find((p) => p.id === professionId);
  if (!prof) return { ok: false, error: 'Unknown artisan profession.', state };

  const currentLevel = state.professionLevels[professionId] ?? 0;
  if (currentLevel >= prof.maxLevel) {
    return { ok: false, error: 'Profession reached max mastery (Lv. 99).', state };
  }

  const cost = getProfessionUpgradeCost(professionId, currentLevel);
  if (state.resources.glimmerShards < cost) {
    return { ok: false, error: `Requires ${cost} Glimmer Shards.`, state };
  }

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      dailyQuests: {
        ...state.dailyQuests,
        upgradesCompleted: state.dailyQuests.upgradesCompleted + 1,
      },
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards - cost,
      },
      professionLevels: {
        ...state.professionLevels,
        [professionId]: currentLevel + 1,
      },
    },
  };
}

export function claimDailyQuest(
  rawState: PlayerState,
  questId: string,
  todayKey = getUtcDateKey(),
): { ok: boolean; error?: string; state: PlayerState } {
  const state = ensureCurrentDailyQuests(rawState, todayKey);
  const quest = DAILY_QUEST_CATALOG.find((q) => q.id === questId);
  if (!quest) return { ok: false, error: 'Daily quest not found.', state };

  if (state.dailyQuests.claimedQuestIds.includes(questId)) {
    return { ok: false, error: 'Daily quest reward already claimed today.', state };
  }

  const currentProgress = state.dailyQuests[quest.metric] ?? 0;
  if (currentProgress < quest.target) {
    return {
      ok: false,
      error: `Progress ${currentProgress}/${quest.target} — complete the objective first.`,
      state,
    };
  }

  const nextClaimed = [...state.dailyQuests.claimedQuestIds, questId];
  const allClaimed = DAILY_QUEST_CATALOG.every((q) => nextClaimed.includes(q.id));
  const nextStreak = allClaimed ? state.dailyQuests.streakCount + 1 : state.dailyQuests.streakCount;

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      dailyQuests: {
        ...state.dailyQuests,
        claimedQuestIds: nextClaimed,
        streakCount: nextStreak,
        status: allClaimed ? 'all_claimed' : 'active',
      },
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards + quest.rewardShards,
        totalGlimmerEarned: state.resources.totalGlimmerEarned + quest.rewardShards,
        verdantEssence: state.resources.verdantEssence + quest.rewardEssence,
        voidMotes: state.resources.voidMotes + quest.rewardVoidMotes,
      },
    },
  };
}

export function unlockOrSelectZone(
  state: PlayerState,
  zoneId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const zone = FOREST_ZONES.find((z) => z.id === zoneId);
  if (!zone) return { ok: false, error: 'Forest realm not found.', state };

  if (state.unlockedZoneIds.includes(zoneId)) {
    return {
      ok: true,
      state: {
        ...state,
        activeZoneId: zoneId,
        stateVersion: state.stateVersion + 1,
        lastUpdatedAt: Date.now(),
      },
    };
  }

  if (state.resources.glimmerShards < zone.unlockCost) {
    return { ok: false, error: `Requires ${zone.unlockCost} Glimmer Shards to enter ${zone.name}.`, state };
  }

  return {
    ok: true,
    state: {
      ...state,
      activeZoneId: zoneId,
      unlockedZoneIds: [...state.unlockedZoneIds, zoneId],
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards - zone.unlockCost,
      },
    },
  };
}

export function toggleTcgCardSlot(
  state: PlayerState,
  cardId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const card = TCG_CARDS.find((c) => c.id === cardId);
  if (!card) return { ok: false, error: 'TCG card not found.', state };

  let nextState = state;
  if (!state.unlockedTcgCardIds.includes(cardId)) {
    if (state.resources.verdantEssence < card.unlockCostEssence) {
      return { ok: false, error: `Requires ${card.unlockCostEssence} Verdant Essence.`, state };
    }
    nextState = {
      ...state,
      unlockedTcgCardIds: [...state.unlockedTcgCardIds, cardId],
      resources: {
        ...state.resources,
        verdantEssence: state.resources.verdantEssence - card.unlockCostEssence,
      },
    };
  }

  const isEquipped = nextState.equippedResonanceRow.includes(cardId);
  let nextRow: string[];
  if (isEquipped) {
    nextRow = nextState.equippedResonanceRow.filter((id) => id !== cardId);
  } else {
    nextRow = [...nextState.equippedResonanceRow, cardId].slice(-3);
  }

  return {
    ok: true,
    state: {
      ...nextState,
      equippedResonanceRow: nextRow,
      stateVersion: nextState.stateVersion + 1,
      lastUpdatedAt: Date.now(),
    },
  };
}

export function mintNftSkin(
  state: PlayerState,
  skinId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const skin = NFT_SKIN_CATALOG.find((s) => s.id === skinId);
  if (!skin) return { ok: false, error: 'NFT skin not found.', state };
  if (state.ownedSkinIds.includes(skinId)) {
    return { ok: false, error: 'NFT skin already owned in vault.', state };
  }
  if (state.resources.glimmerShards < skin.mintCostShards) {
    return { ok: false, error: `Requires ${skin.mintCostShards} Glimmer Shards.`, state };
  }
  if (state.resources.voidMotes < skin.mintCostVoidMotes) {
    return { ok: false, error: `Requires ${skin.mintCostVoidMotes} Void Motes.`, state };
  }

  return {
    ok: true,
    state: {
      ...state,
      ownedSkinIds: [...state.ownedSkinIds, skinId],
      equippedSkinByEntity: {
        ...state.equippedSkinByEntity,
        [skin.entityId]: skin.id,
      },
      activeEntityId: skin.entityId,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      resources: {
        ...state.resources,
        glimmerShards: state.resources.glimmerShards - skin.mintCostShards,
        voidMotes: state.resources.voidMotes - skin.mintCostVoidMotes,
      },
    },
  };
}

export function equipNftSkin(
  state: PlayerState,
  skinId: string,
): { ok: boolean; error?: string; state: PlayerState } {
  const skin = NFT_SKIN_CATALOG.find((s) => s.id === skinId);
  if (!skin) return { ok: false, error: 'NFT skin not found.', state };
  if (!state.ownedSkinIds.includes(skinId)) {
    return { ok: false, error: 'Mint this NFT skin before equipping.', state };
  }

  return {
    ok: true,
    state: {
      ...state,
      equippedSkinByEntity: {
        ...state.equippedSkinByEntity,
        [skin.entityId]: skin.id,
      },
      activeEntityId: skin.entityId,
      stateVersion: state.stateVersion + 1,
      lastUpdatedAt: Date.now(),
    },
  };
}

export function resolveNexusDuelTurn(
  match: NexusMatch,
  playerRite: RiteId,
  opponentRite: RiteId,
): NexusMatch {
  if (match.status !== 'active') return match;

  const pRite = RITE_DEFINITIONS[playerRite];
  const oRite = RITE_DEFINITIONS[opponentRite];

  const playerCounters = pRite.counters === opponentRite;
  const opponentCounters = oRite.counters === playerRite;

  const pCovAdvantage = COVENANT_META[match.playerCovenant].strongAgainst === match.opponentCovenant ? 1.08 : 1.0;
  const oCovAdvantage = COVENANT_META[match.opponentCovenant].strongAgainst === match.playerCovenant ? 1.08 : 1.0;

  const playerDamage = Math.max(
    12,
    Math.round(
      match.playerPower * 0.36 * pRite.powerMult * pCovAdvantage * (playerCounters ? 1.32 : opponentCounters ? 0.8 : 1.0),
    ),
  );
  const opponentDamage = Math.max(
    10,
    Math.round(
      match.opponentPower * 0.34 * oRite.powerMult * oCovAdvantage * (opponentCounters ? 1.3 : playerCounters ? 0.78 : 1.0),
    ),
  );

  const playerHeal = Math.round(match.playerMaxHp * pRite.healPct);
  const opponentHeal = Math.round(match.opponentMaxHp * oRite.healPct);

  const nextOpponentHp = Math.max(0, Math.min(match.opponentMaxHp, match.opponentHp - playerDamage + opponentHeal));
  const nextPlayerHp = Math.max(0, Math.min(match.playerMaxHp, match.playerHp - opponentDamage + playerHeal));

  let note = `${pRite.name} clashed with ${oRite.name}.`;
  if (playerCounters) note = `Counter! ${pRite.name} broke through ${oRite.name}.`;
  else if (opponentCounters) note = `${oRite.name} countered your ${pRite.name}.`;

  const turnLog: DuelTurnLog = {
    turn: match.currentTurn,
    playerRite,
    opponentRite,
    playerDamage,
    opponentDamage,
    playerHpAfter: nextPlayerHp,
    opponentHpAfter: nextOpponentHp,
    note,
  };

  let status: NexusMatch['status'] = 'active';
  if (nextOpponentHp <= 0 && nextPlayerHp > 0) status = 'victory';
  else if (nextPlayerHp <= 0 && nextOpponentHp > 0) status = 'defeat';
  else if (nextPlayerHp <= 0 && nextOpponentHp <= 0) status = 'draw';
  else if (match.currentTurn >= match.maxTurns) {
    if (nextPlayerHp > nextOpponentHp) status = 'victory';
    else if (nextPlayerHp < nextOpponentHp) status = 'defeat';
    else status = 'draw';
  }

  let eloDelta = 0;
  let rewardShards = 0;
  let rewardVoidMotes = 0;

  if (status !== 'active') {
    const expected = 1 / (1 + Math.pow(10, (match.opponentElo - 1000) / 400));
    const score = status === 'victory' ? 1 : status === 'draw' ? 0.5 : 0;
    eloDelta = Math.round(28 * (score - expected));
    if (status === 'victory' && eloDelta < 12) eloDelta = 12;
    if (status === 'defeat' && eloDelta > -8) eloDelta = -8;
    rewardShards = status === 'victory' ? Math.round(65 + match.playerPower * 1.4) : Math.round(20 + match.playerPower * 0.4);
    rewardVoidMotes = status === 'victory' ? 3 : 1;
  }

  return {
    ...match,
    playerHp: nextPlayerHp,
    opponentHp: nextOpponentHp,
    currentTurn: status === 'active' ? match.currentTurn + 1 : match.currentTurn,
    status,
    eloDelta,
    rewardShards,
    rewardVoidMotes,
    turnLogs: [...match.turnLogs, turnLog],
  };
}

export function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('en-US');
}
