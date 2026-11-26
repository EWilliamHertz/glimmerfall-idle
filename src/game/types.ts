export type CovenantId = 'Solari' | 'Terra' | 'Aether' | 'Umbri';

export type GameShellState = 'title' | 'playing' | 'paused' | 'gameover';

export type ActiveTab = 'forest' | 'entities' | 'quests' | 'vault' | 'arena' | 'ledger';

export type RarityTier = 'Covenant' | 'Relic' | 'Mythic';

export type TcgKeyword = 'Guard' | 'Evasive' | 'Resonance' | 'Void Recycle';

export type RiteId = 'solari_strike' | 'terra_guard' | 'aether_channel' | 'umbri_drain';

export interface EntityDefinition {
  id: string;
  name: string;
  covenant: CovenantId;
  role: string;
  lore: string;
  sourceRef: 'glimmerfall.online' | 'glimmerfalltcg.com' | 'manga.glimmerfall.online';
  portraitUrl: string;
  blobKeywords: string[];
  baseCost: number;
  costMultiplier: number;
  baseResonancePerSec: number;
  baseClickPower: number;
  baseCombatPower: number;
}

export interface ForestZoneDefinition {
  id: string;
  name: string;
  covenant: CovenantId;
  description: string;
  sourceRef: 'glimmerfall.online' | 'glimmerfalltcg.com' | 'manga.glimmerfall.online';
  unlockCost: number;
  yieldMultiplier: number;
  essenceBonusPerClick: number;
  palette: {
    skyTop: string;
    skyBottom: string;
    canopyBack: string;
    canopyMid: string;
    canopyFront: string;
    ground: string;
    nodeGlow: string;
    particleHex: string;
  };
}

export interface TcgCardDefinition {
  id: string;
  name: string;
  covenant: CovenantId;
  keyword: TcgKeyword;
  cardType: 'Entity' | 'Rite' | 'Relic';
  effectSummary: string;
  unlockCostEssence: number;
  idleMultiplierBonus: number;
  clickMultiplierBonus: number;
  pvpPowerBonus: number;
}

export interface NftSkinDefinition {
  id: string;
  tokenId: string;
  contractAddress: string;
  name: string;
  entityId: string;
  covenant: CovenantId;
  rarity: RarityTier;
  editionSource: 'glimmerfall.online' | 'glimmerfalltcg.com' | 'manga.glimmerfall.online';
  description: string;
  mintCostShards: number;
  mintCostVoidMotes: number;
  productionBonus: number;
  pvpBonus: number;
  auraHex: string;
  portraitFilter: string;
}

export interface ProfessionDefinition {
  id: string;
  name: string;
  maxLevel: number;
  baseCost: number;
  description: string;
  bonusPerLevel: number;
  resourceFocus: 'glimmer' | 'essence' | 'void' | 'pvp';
}

export interface MangaChapterDefinition {
  id: string;
  chapterNumber: number;
  title: string;
  arc: string;
  urlRef: string;
  unlockTotalGlimmer: number;
  passiveBonusPct: number;
  excerpt: string;
}

export type DailyQuestMetric =
  | 'tapsCompleted'
  | 'upgradesCompleted'
  | 'duelsCompleted'
  | 'blocksAnchored';

export interface DailyQuestDefinition {
  id: string;
  title: string;
  description: string;
  sourceRef: 'glimmerfall.online' | 'glimmerfalltcg.com' | 'manga.glimmerfall.online';
  metric: DailyQuestMetric;
  target: number;
  rewardShards: number;
  rewardEssence: number;
  rewardVoidMotes: number;
}

export interface DailyQuestProgress {
  dateKey: string;
  tapsCompleted: number;
  upgradesCompleted: number;
  duelsCompleted: number;
  blocksAnchored: number;
  claimedQuestIds: string[];
  streakCount: number;
  status: 'active' | 'all_claimed';
}

export interface StateBlock {
  blockHeight: number;
  timestamp: number;
  prevHash: string;
  stateRoot: string;
  blockHash: string;
  txHash: string;
  playerId: string;
  summary: string;
  authoritySignature?: string;
}

export interface PlayerResources {
  glimmerShards: number;
  totalGlimmerEarned: number;
  verdantEssence: number;
  voidMotes: number;
  nexusTrophies: number;
}

export interface PlayerState {
  playerId: string;
  playerName: string;
  covenant: CovenantId;
  walletAddress: string | null;
  platform: 'desktop' | 'mobile' | 'tablet';
  resources: PlayerResources;
  entityLevels: Record<string, number>;
  professionLevels: Record<string, number>;
  activeZoneId: string;
  unlockedZoneIds: string[];
  unlockedTcgCardIds: string[];
  equippedResonanceRow: string[];
  ownedSkinIds: string[];
  equippedSkinByEntity: Record<string, string>;
  activeEntityId: string;
  dailyQuests: DailyQuestProgress;
  elo: number;
  wins: number;
  losses: number;
  totalClicks: number;
  lastUpdatedAt: number;
  stateVersion: number;
  flagged?: boolean;
}

export interface ProductionBreakdown {
  resonancePerSec: number;
  clickYield: number;
  essencePerClick: number;
  voidMotesPerMinute: number;
  combatPower: number;
  zoneMultiplier: number;
  tcgMultiplier: number;
  skinMultiplier: number;
  mangaMultiplier: number;
  professionMultiplier: number;
}

export interface DuelTurnLog {
  turn: number;
  playerRite: RiteId;
  opponentRite: RiteId;
  playerDamage: number;
  opponentDamage: number;
  playerHpAfter: number;
  opponentHpAfter: number;
  note: string;
}

export interface NexusMatch {
  matchId: string;
  playerId: string;
  playerName: string;
  playerCovenant: CovenantId;
  playerPower: number;
  playerHp: number;
  playerMaxHp: number;
  opponentId: string;
  opponentName: string;
  opponentCovenant: CovenantId;
  opponentElo: number;
  opponentPower: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentRegion: string;
  isLivePlayer: boolean;
  currentTurn: number;
  maxTurns: number;
  status: 'active' | 'victory' | 'defeat' | 'draw';
  eloDelta: number;
  rewardShards: number;
  rewardVoidMotes: number;
  turnLogs: DuelTurnLog[];
  createdAt: number;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  covenant: CovenantId;
  elo: number;
  wins: number;
  losses: number;
  combatPower: number;
  activeZoneId: string;
  equippedSkinCount: number;
}

export type AdminRole = 'SUPER_ADMIN' | 'GAME_DESIGNER' | 'ANALYST' | 'MODERATOR';

export type AdminPermission =
  | 'view_analytics'
  | 'view_audit_logs'
  | 'manage_roles'
  | 'adjust_economy'
  | 'moderate_players';

export interface AdminOperator {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  createdAt: number;
  lastActiveAt: number;
  active: boolean;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: 'PLAYER' | AdminRole;
  category: 'gameplay' | 'blockchain' | 'nft' | 'matchmaking' | 'admin' | 'security';
  action: string;
  summary: string;
  platform: string;
  latencyMs: number;
  blockHeight?: number;
}

export interface AnalyticsSnapshot {
  generatedAt: number;
  totalPlayers: number;
  activePlayersLast15m: number;
  totalGlimmerCirculation: number;
  totalStateBlocks: number;
  totalNftsMinted: number;
  matchesCompleted: number;
  activeQueueDepth: number;
  apiTelemetry: {
    sampleCount: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    requestsLastMinute: number;
  };
  covenantDistribution: Record<CovenantId, number>;
  skinAdoption: { skinId: string; name: string; count: number }[];
  platformBreakdown: Record<'desktop' | 'mobile' | 'tablet', number>;
}
