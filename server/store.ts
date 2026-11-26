import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  COVENANT_META,
  NFT_SKIN_CATALOG,
  RANKED_CHALLENGERS,
  ROLE_PERMISSIONS,
} from '../src/game/catalog';
import { createStateBlock } from '../src/game/chain';
import {
  calculateProduction,
  createInitialDailyQuestProgress,
  createInitialPlayerState,
  ensureCurrentDailyQuests,
} from '../src/game/engine';
import type {
  ActivityLogEntry,
  AdminOperator,
  AdminRole,
  AnalyticsSnapshot,
  CovenantId,
  LeaderboardEntry,
  NexusMatch,
  PlayerState,
  StateBlock,
} from '../src/game/types';

export interface OperatorRecord extends AdminOperator {
  passwordSalt?: string;
  passwordHash?: string;
}

export interface PersistedStore {
  adminBootstrapSalt: string | null;
  adminBootstrapHash: string | null;
  players: Record<string, PlayerState>;
  chains: Record<string, StateBlock[]>;
  operators: OperatorRecord[];
  activityLogs: ActivityLogEntry[];
  matchesCompleted: number;
}

export interface ApiLatencySample {
  timestamp: number;
  durationMs: number;
  route: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'glimmerfall-store.json');

// Verify path confinement strictly inside DATA_DIR
if (!STORE_PATH.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid persistent store path.');
}

const HMAC_SECRET = crypto.randomBytes(32);

export function signBlockDigest(blockHash: string): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(blockHash).digest('hex');
}

export function hashPasswordScrypt(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPasswordScrypt(password: string, salt: string, expectedHash: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export function timingSafeEqualSecret(provided: string, expected: string): boolean {
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function createSeedStore(): PersistedStore {
  const now = Date.now();
  const seedSpecs: {
    id: string;
    name: string;
    covenant: CovenantId;
    platform: 'desktop' | 'mobile' | 'tablet';
    shards: number;
    total: number;
    elo: number;
    wins: number;
    losses: number;
    zone: string;
    skins: string[];
  }[] = [
    {
      id: 'warden_solari_01',
      name: 'Seraphina Dawnblade',
      covenant: 'Solari',
      platform: 'desktop',
      shards: 1840,
      total: 14200,
      elo: 1345,
      wins: 19,
      losses: 6,
      zone: 'duskwood_glade',
      skins: ['skin_solari_dawnplate'],
    },
    {
      id: 'warden_terra_02',
      name: 'Bramblewarden Oren',
      covenant: 'Terra',
      platform: 'mobile',
      shards: 920,
      total: 6850,
      elo: 1218,
      wins: 14,
      losses: 7,
      zone: 'verdant_root_canopy',
      skins: ['skin_terra_elderbark'],
    },
    {
      id: 'warden_aether_03',
      name: 'Lyris Prismweaver',
      covenant: 'Aether',
      platform: 'mobile',
      shards: 4120,
      total: 29400,
      elo: 1290,
      wins: 17,
      losses: 8,
      zone: 'celestial_mist_hollow',
      skins: ['skin_aether_starweave'],
    },
    {
      id: 'warden_umbri_04',
      name: 'Nyx of Void Gate',
      covenant: 'Umbri',
      platform: 'tablet',
      shards: 3250,
      total: 21800,
      elo: 1185,
      wins: 11,
      losses: 9,
      zone: 'void_touched_bramble',
      skins: ['skin_umbri_eclipse'],
    },
  ];

  const players: Record<string, PlayerState> = {};
  const chains: Record<string, StateBlock[]> = {};
  const activityLogs: ActivityLogEntry[] = [];

  for (const spec of seedSpecs) {
    const p = createInitialPlayerState(spec.id, spec.name, spec.covenant, spec.platform);
    p.resources.glimmerShards = spec.shards;
    p.resources.totalGlimmerEarned = spec.total;
    p.resources.verdantEssence = 95;
    p.resources.voidMotes = 12;
    p.entityLevels.solari_vanguard = 6;
    p.entityLevels.ancient_moss_drake = 4;
    p.entityLevels.mind_sculptor = 2;
    p.activeZoneId = spec.zone;
    p.unlockedZoneIds = ['verdant_root_canopy', spec.zone];
    p.ownedSkinIds = [...spec.skins];
    if (spec.skins[0]) {
      const skinDef = NFT_SKIN_CATALOG.find((s) => s.id === spec.skins[0]);
      if (skinDef) p.equippedSkinByEntity[skinDef.entityId] = skinDef.id;
    }
    p.elo = spec.elo;
    p.wins = spec.wins;
    p.losses = spec.losses;
    p.lastUpdatedAt = now - Math.floor(Math.random() * 180_000);
    players[spec.id] = p;

    const genesis = createStateBlock(p, null, 'Genesis Covenant Anchor', p.lastUpdatedAt);
    genesis.authoritySignature = signBlockDigest(genesis.blockHash);
    chains[spec.id] = [genesis];

    activityLogs.push({
      id: `log_seed_${spec.id}`,
      timestamp: p.lastUpdatedAt,
      actorId: p.playerId,
      actorName: p.playerName,
      actorRole: 'PLAYER',
      category: 'blockchain',
      action: 'state_commit',
      summary: `Anchored Block #1 (${genesis.txHash.slice(0, 12)}…) in ${spec.zone}`,
      platform: spec.platform,
      latencyMs: 6,
      blockHeight: 1,
    });
  }

  const operators: OperatorRecord[] = [
    {
      id: 'op_root',
      username: 'lead_architect',
      displayName: 'GlimmerFall Lead Architect',
      role: 'SUPER_ADMIN',
      createdAt: now - 86_400_000,
      lastActiveAt: now,
      active: true,
    },
    {
      id: 'op_balance',
      username: 'covenant_designer',
      displayName: 'TCG Economy Designer',
      role: 'GAME_DESIGNER',
      createdAt: now - 43_200_000,
      lastActiveAt: now - 3_600_000,
      active: true,
    },
    {
      id: 'op_analyst',
      username: 'nexus_analyst',
      displayName: 'Matchmaking Analyst',
      role: 'ANALYST',
      createdAt: now - 21_600_000,
      lastActiveAt: now - 1_800_000,
      active: true,
    },
  ];

  return {
    adminBootstrapSalt: null,
    adminBootstrapHash: null,
    players,
    chains,
    operators,
    activityLogs,
    matchesCompleted: 61,
  };
}

export class GlimmerFallStore {
  private data: PersistedStore;
  private latencySamples: ApiLatencySample[] = [];
  private activeMatches: Map<string, NexusMatch> = new Map();
  private matchmakingQueue: Map<string, { playerId: string; elo: number; queuedAt: number }> = new Map();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadFromDisk();
  }

  private loadFromDisk(): PersistedStore {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as PersistedStore;
        if (parsed && typeof parsed === 'object' && parsed.players && parsed.chains) {
          // Normalize any persisted player records from earlier schema versions
          for (const [id, rawPlayer] of Object.entries(parsed.players)) {
            const legacy = rawPlayer as PlayerState & {
              heroLevels?: Record<string, number>;
              activeHeroId?: string;
              equippedSkinByHero?: Record<string, string>;
            };
            const normalized: PlayerState = {
              ...legacy,
              entityLevels: legacy.entityLevels ?? legacy.heroLevels ?? { solari_vanguard: 1 },
              activeEntityId: legacy.activeEntityId ?? legacy.activeHeroId ?? 'solari_vanguard',
              equippedSkinByEntity: legacy.equippedSkinByEntity ?? legacy.equippedSkinByHero ?? {},
              dailyQuests: legacy.dailyQuests ?? createInitialDailyQuestProgress(),
            };
            parsed.players[id] = ensureCurrentDailyQuests(normalized);
          }
          return parsed;
        }
      }
    } catch {
      // Fall through to clean seed store if disk file is missing or malformed
    }
    const seeded = createSeedStore();
    this.persistNow(seeded);
    return seeded;
  }

  private persistNow(target: PersistedStore = this.data): void {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${STORE_PATH}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(target, null, 2), 'utf8');
      fs.renameSync(tmp, STORE_PATH);
    } catch {
      // Non-fatal in ephemeral containers
    }
  }

  public schedulePersist(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistNow();
    }, 350);
  }

  public recordLatency(route: string, durationMs: number): void {
    this.latencySamples.push({
      timestamp: Date.now(),
      durationMs: Math.max(0.2, Math.round(durationMs * 10) / 10),
      route,
    });
    if (this.latencySamples.length > 500) {
      this.latencySamples.splice(0, this.latencySamples.length - 500);
    }
  }

  public hasBootstrapHash(): boolean {
    return Boolean(this.data.adminBootstrapSalt && this.data.adminBootstrapHash);
  }

  public claimBootstrapPassword(password: string): boolean {
    if (this.hasBootstrapHash()) return false;
    const { salt, hash } = hashPasswordScrypt(password);
    this.data.adminBootstrapSalt = salt;
    this.data.adminBootstrapHash = hash;
    this.persistNow();
    return true;
  }

  public verifyBootstrapPassword(password: string): boolean {
    if (!this.data.adminBootstrapSalt || !this.data.adminBootstrapHash) return false;
    return verifyPasswordScrypt(password, this.data.adminBootstrapSalt, this.data.adminBootstrapHash);
  }

  public getOrCreatePlayer(
    playerId: string,
    playerName?: string,
    covenant?: CovenantId,
    platform: 'desktop' | 'mobile' | 'tablet' = 'desktop',
  ): { player: PlayerState; chain: StateBlock[]; isNew: boolean } {
    const existing = this.data.players[playerId];
    if (existing) {
      return {
        player: existing,
        chain: this.data.chains[playerId] ?? [],
        isNew: false,
      };
    }

    const created = createInitialPlayerState(
      playerId,
      playerName?.trim().slice(0, 28) || 'Glade Warden',
      covenant && covenant in COVENANT_META ? covenant : 'Solari',
      platform,
    );
    this.data.players[playerId] = created;
    const genesis = createStateBlock(created, null, 'Genesis Covenant Anchor');
    genesis.authoritySignature = signBlockDigest(genesis.blockHash);
    this.data.chains[playerId] = [genesis];
    this.schedulePersist();
    return { player: created, chain: this.data.chains[playerId], isNew: true };
  }

  public getPlayer(playerId: string): PlayerState | null {
    return this.data.players[playerId] ?? null;
  }

  public savePlayer(player: PlayerState): void {
    this.data.players[player.playerId] = player;
    this.schedulePersist();
  }

  public getChain(playerId: string): StateBlock[] {
    return this.data.chains[playerId] ?? [];
  }

  public commitStateBlock(player: PlayerState, summary: string): StateBlock {
    const chain = this.data.chains[player.playerId] ?? [];
    const prev = chain.length > 0 ? chain[chain.length - 1] : null;
    const block = createStateBlock(player, prev, summary);
    block.authoritySignature = signBlockDigest(block.blockHash);
    chain.push(block);
    // Keep up to 120 blocks per player in storage while maintaining valid linkage from genesis
    this.data.chains[player.playerId] = chain;
    this.data.players[player.playerId] = player;
    this.schedulePersist();
    return block;
  }

  public appendActivityLog(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): ActivityLogEntry {
    const full: ActivityLogEntry = {
      ...entry,
      id: `evt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: Date.now(),
    };
    this.data.activityLogs.unshift(full);
    if (this.data.activityLogs.length > 400) {
      this.data.activityLogs.length = 400;
    }
    this.schedulePersist();
    return full;
  }

  public getActivityLogs(filters?: { category?: string; search?: string; limit?: number }): ActivityLogEntry[] {
    let logs = this.data.activityLogs;
    if (filters?.category && filters.category !== 'all') {
      logs = logs.filter((l) => l.category === filters.category);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.actorName.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.summary.toLowerCase().includes(q) ||
          l.actorId.toLowerCase().includes(q),
      );
    }
    const limit = Math.min(Math.max(filters?.limit ?? 100, 1), 300);
    return logs.slice(0, limit);
  }

  public getLeaderboard(limit = 15): LeaderboardEntry[] {
    return Object.values(this.data.players)
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        covenant: p.covenant,
        elo: p.elo,
        wins: p.wins,
        losses: p.losses,
        combatPower: calculateProduction(p).combatPower,
        activeZoneId: p.activeZoneId,
        equippedSkinCount: Object.keys(p.equippedSkinByEntity ?? {}).length,
      }))
      .sort((a, b) => b.elo - a.elo || b.combatPower - a.combatPower)
      .slice(0, limit);
  }

  public createRankedMatch(player: PlayerState): NexusMatch {
    const prod = calculateProduction(player);
    const playerMaxHp = 180 + Math.round(prod.combatPower * 0.9);

    // Check if another live player is waiting in the matchmaking queue within Elo band
    let liveOpponent: PlayerState | null = null;
    for (const [queuedId, entry] of this.matchmakingQueue.entries()) {
      if (queuedId !== player.playerId && Math.abs(entry.elo - player.elo) <= 300) {
        const candidate = this.data.players[queuedId];
        if (candidate) {
          liveOpponent = candidate;
          this.matchmakingQueue.delete(queuedId);
          break;
        }
      }
    }

    if (liveOpponent) {
      const oppProd = calculateProduction(liveOpponent);
      const oppMaxHp = 180 + Math.round(oppProd.combatPower * 0.9);
      const match: NexusMatch = {
        matchId: `mx_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
        playerId: player.playerId,
        playerName: player.playerName,
        playerCovenant: player.covenant,
        playerPower: prod.combatPower,
        playerHp: playerMaxHp,
        playerMaxHp,
        opponentId: liveOpponent.playerId,
        opponentName: liveOpponent.playerName,
        opponentCovenant: liveOpponent.covenant,
        opponentElo: liveOpponent.elo,
        opponentPower: oppProd.combatPower,
        opponentHp: oppMaxHp,
        opponentMaxHp: oppMaxHp,
        opponentRegion: 'Global Live Queue',
        isLivePlayer: true,
        currentTurn: 1,
        maxTurns: 3,
        status: 'active',
        eloDelta: 0,
        rewardShards: 0,
        rewardVoidMotes: 0,
        turnLogs: [],
        createdAt: Date.now(),
      };
      this.activeMatches.set(match.matchId, match);
      return match;
    }

    // Match against closest Elo-ranked Covenant Challenger
    const sorted = [...RANKED_CHALLENGERS].sort(
      (a, b) => Math.abs(a.elo - player.elo) - Math.abs(b.elo - player.elo),
    );
    const chosen = sorted[Math.floor(Math.random() * Math.min(2, sorted.length))] ?? RANKED_CHALLENGERS[0];
    const oppPower = Math.max(45, Math.round(prod.combatPower * chosen.powerFactor));
    const oppMaxHp = 175 + Math.round(oppPower * 0.88);

    const match: NexusMatch = {
      matchId: `mx_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      playerId: player.playerId,
      playerName: player.playerName,
      playerCovenant: player.covenant,
      playerPower: prod.combatPower,
      playerHp: playerMaxHp,
      playerMaxHp,
      opponentId: chosen.id,
      opponentName: chosen.name,
      opponentCovenant: chosen.covenant,
      opponentElo: chosen.elo,
      opponentPower: oppPower,
      opponentHp: oppMaxHp,
      opponentMaxHp: oppMaxHp,
      opponentRegion: chosen.region,
      isLivePlayer: false,
      currentTurn: 1,
      maxTurns: 3,
      status: 'active',
      eloDelta: 0,
      rewardShards: 0,
      rewardVoidMotes: 0,
      turnLogs: [],
      createdAt: Date.now(),
    };
    this.activeMatches.set(match.matchId, match);
    return match;
  }

  public getMatch(matchId: string): NexusMatch | null {
    return this.activeMatches.get(matchId) ?? null;
  }

  public updateMatch(match: NexusMatch): void {
    this.activeMatches.set(match.matchId, match);
    if (match.status !== 'active') {
      this.data.matchesCompleted += 1;
      this.schedulePersist();
    }
  }

  public getOperators(): AdminOperator[] {
    return this.data.operators.map(({ passwordHash: _h, passwordSalt: _s, ...pub }) => pub);
  }

  public findOperatorByUsername(username: string): OperatorRecord | null {
    return (
      this.data.operators.find(
        (op) => op.username.toLowerCase() === username.trim().toLowerCase() && op.active,
      ) ?? null
    );
  }

  public createOperator(input: {
    username: string;
    displayName: string;
    role: AdminRole;
    password: string;
  }): { ok: boolean; error?: string; operator?: AdminOperator } {
    const cleanUsername = input.username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(cleanUsername)) {
      return { ok: false, error: 'Username must be 3-32 lowercase alphanumeric/underscore characters.' };
    }
    if (this.data.operators.some((o) => o.username === cleanUsername)) {
      return { ok: false, error: 'Operator username already exists.' };
    }
    if (!(input.role in ROLE_PERMISSIONS)) {
      return { ok: false, error: 'Invalid RBAC role.' };
    }
    if (input.password.length < 8) {
      return { ok: false, error: 'Operator passcode must be at least 8 characters.' };
    }

    const { salt, hash } = hashPasswordScrypt(input.password);
    const now = Date.now();
    const record: OperatorRecord = {
      id: `op_${now.toString(36)}_${crypto.randomBytes(2).toString('hex')}`,
      username: cleanUsername,
      displayName: input.displayName.trim().slice(0, 40) || cleanUsername,
      role: input.role,
      createdAt: now,
      lastActiveAt: now,
      active: true,
      passwordSalt: salt,
      passwordHash: hash,
    };
    this.data.operators.push(record);
    this.persistNow();
    const { passwordHash: _h, passwordSalt: _s, ...pub } = record;
    return { ok: true, operator: pub };
  }

  public updateOperatorRole(operatorId: string, role: AdminRole, active?: boolean): AdminOperator | null {
    const op = this.data.operators.find((o) => o.id === operatorId);
    if (!op) return null;
    if (op.id === 'op_root' && (role !== 'SUPER_ADMIN' || active === false)) {
      return null;
    }
    op.role = role;
    if (typeof active === 'boolean') op.active = active;
    op.lastActiveAt = Date.now();
    this.persistNow();
    const { passwordHash: _h, passwordSalt: _s, ...pub } = op;
    return pub;
  }

  public getAllPlayersSummary() {
    return Object.values(this.data.players)
      .map((p) => {
        const chain = this.data.chains[p.playerId] ?? [];
        const latest = chain[chain.length - 1];
        return {
          playerId: p.playerId,
          playerName: p.playerName,
          covenant: p.covenant,
          platform: p.platform,
          glimmerShards: Math.round(p.resources.glimmerShards),
          totalGlimmerEarned: Math.round(p.resources.totalGlimmerEarned),
          elo: p.elo,
          wins: p.wins,
          losses: p.losses,
          ownedSkins: p.ownedSkinIds.length,
          blockHeight: latest?.blockHeight ?? 0,
          stateRoot: latest?.stateRoot ?? '',
          lastUpdatedAt: p.lastUpdatedAt,
          flagged: Boolean(p.flagged),
        };
      })
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
  }

  public getAnalytics(): AnalyticsSnapshot {
    const now = Date.now();
    const players = Object.values(this.data.players);
    const activePlayersLast15m = players.filter((p) => now - p.lastUpdatedAt <= 15 * 60_000).length;
    const totalGlimmerCirculation = Math.round(
      players.reduce((sum, p) => sum + p.resources.glimmerShards, 0),
    );
    const totalStateBlocks = Object.values(this.data.chains).reduce((sum, c) => sum + c.length, 0);
    const totalNftsMinted = players.reduce((sum, p) => sum + p.ownedSkinIds.length, 0);

    const covenantDistribution: Record<CovenantId, number> = {
      Solari: 0,
      Terra: 0,
      Aether: 0,
      Umbri: 0,
    };
    const platformBreakdown: Record<'desktop' | 'mobile' | 'tablet', number> = {
      desktop: 0,
      mobile: 0,
      tablet: 0,
    };
    const skinCounts: Record<string, number> = {};

    for (const p of players) {
      covenantDistribution[p.covenant] = (covenantDistribution[p.covenant] ?? 0) + 1;
      platformBreakdown[p.platform] = (platformBreakdown[p.platform] ?? 0) + 1;
      for (const sId of p.ownedSkinIds) {
        skinCounts[sId] = (skinCounts[sId] ?? 0) + 1;
      }
    }

    const skinAdoption = NFT_SKIN_CATALOG.map((skin) => ({
      skinId: skin.id,
      name: skin.name,
      count: skinCounts[skin.id] ?? 0,
    })).sort((a, b) => b.count - a.count);

    const durations = this.latencySamples.map((s) => s.durationMs).sort((a, b) => a - b);
    const sampleCount = durations.length;
    const avgLatencyMs =
      sampleCount > 0
        ? Math.round((durations.reduce((a, b) => a + b, 0) / sampleCount) * 10) / 10
        : 0;
    const p50LatencyMs = sampleCount > 0 ? durations[Math.floor(sampleCount * 0.5)] : 0;
    const p95LatencyMs = sampleCount > 0 ? durations[Math.min(sampleCount - 1, Math.floor(sampleCount * 0.95))] : 0;
    const requestsLastMinute = this.latencySamples.filter((s) => now - s.timestamp <= 60_000).length;

    return {
      generatedAt: now,
      totalPlayers: players.length,
      activePlayersLast15m,
      totalGlimmerCirculation,
      totalStateBlocks,
      totalNftsMinted,
      matchesCompleted: this.data.matchesCompleted,
      activeQueueDepth: this.matchmakingQueue.size,
      apiTelemetry: {
        sampleCount,
        avgLatencyMs,
        p50LatencyMs,
        p95LatencyMs,
        requestsLastMinute,
      },
      covenantDistribution,
      skinAdoption,
      platformBreakdown,
    };
  }
}
