import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { list as listVercelBlobs } from '@vercel/blob';
import { createServer as createViteServer } from 'vite';
import {
  COVENANT_META,
  ENTITY_CATALOG,
  RITE_DEFINITIONS,
  ROLE_PERMISSIONS,
} from './src/game/catalog';
import { verifyChainIntegrity } from './src/game/chain';
import {
  applyIdleTick,
  applyManualHarvest,
  calculateProduction,
  claimDailyQuest,
  ensureCurrentDailyQuests,
  equipNftSkin,
  mintNftSkin,
  resolveNexusDuelTurn,
  toggleTcgCardSlot,
  unlockOrSelectZone,
  upgradeEntity,
  upgradeProfession,
} from './src/game/engine';
import type { AdminPermission, AdminRole, CovenantId, RiteId } from './src/game/types';
import {
  GlimmerFallStore,
  timingSafeEqualSecret,
  verifyPasswordScrypt,
} from './server/store';

interface AdminSession {
  token: string;
  operatorId: string;
  username: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermission[];
  expiresAt: number;
}

const PORT = Number(process.env.PORT) || 3000;
const PLAYER_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

const store = new GlimmerFallStore();
const adminSessions = new Map<string, AdminSession>();

interface EntityRawImageCache {
  fetchedAt: number;
  source: 'vercel_blob' | 'local_fallback';
  storeConfigured: boolean;
  rawCount: number;
  images: Record<string, string>;
  rawAssets: { pathname: string; url: string }[];
}

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|avif)$/i;
const CARD_EXCLUDE_RE = /(^|[\/_\-.])(card|cards|tcg|frame|frames|border|thumb|thumbnail|mockup|template|back|sleeve)([\/_\-.]|$)/i;
let entityBlobCache: EntityRawImageCache | null = null;
const BLOB_CACHE_TTL_MS = 5 * 60_000;

function isRawEntityImagePath(pathname: string): boolean {
  if (!IMAGE_EXT_RE.test(pathname)) return false;
  if (CARD_EXCLUDE_RE.test(pathname)) return false;
  return true;
}

function buildFallbackEntityImages(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entity of ENTITY_CATALOG) {
    map[entity.id] = entity.portraitUrl;
  }
  return map;
}

async function resolveEntityRawImages(): Promise<EntityRawImageCache> {
  if (entityBlobCache && Date.now() - entityBlobCache.fetchedAt < BLOB_CACHE_TTL_MS) {
    return entityBlobCache;
  }

  const fallbackImages = buildFallbackEntityImages();
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const storeConfigured = Boolean(blobToken || process.env.BLOB_STORE_ID?.trim());

  if (!blobToken) {
    entityBlobCache = {
      fetchedAt: Date.now(),
      source: 'local_fallback',
      storeConfigured,
      rawCount: 0,
      images: fallbackImages,
      rawAssets: [],
    };
    return entityBlobCache;
  }

  try {
    const rawAssets: { pathname: string; url: string }[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page = await listVercelBlobs({
        token: blobToken,
        limit: 200,
        cursor,
      });
      for (const blob of page.blobs) {
        if (blob.url && blob.pathname && isRawEntityImagePath(blob.pathname)) {
          rawAssets.push({ pathname: blob.pathname, url: blob.url });
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
      pages += 1;
    } while (cursor && pages < 5);

    const images: Record<string, string> = { ...fallbackImages };
    const usedUrls = new Set<string>();

    // Prefer explicitly raw/entity paths first
    const prioritized = [...rawAssets].sort((a, b) => {
      const score = (p: string) =>
        (/raw|entit|art|char|creature/i.test(p) ? 2 : 0) + (p.toLowerCase().endsWith('.png') || p.toLowerCase().endsWith('.webp') ? 1 : 0);
      return score(b.pathname) - score(a.pathname);
    });

    for (const entity of ENTITY_CATALOG) {
      const match = prioritized.find((asset) => {
        if (usedUrls.has(asset.url)) return false;
        const lower = asset.pathname.toLowerCase();
        return entity.blobKeywords.some((kw) => lower.includes(kw.toLowerCase()));
      });
      if (match) {
        images[entity.id] = match.url;
        usedUrls.add(match.url);
      }
    }

    // Assign remaining unmatched entities to unused raw images if the blob store has raw art
    for (const entity of ENTITY_CATALOG) {
      if (images[entity.id] !== entity.portraitUrl) continue;
      const unused = prioritized.find((asset) => !usedUrls.has(asset.url));
      if (unused) {
        images[entity.id] = unused.url;
        usedUrls.add(unused.url);
      }
    }

    entityBlobCache = {
      fetchedAt: Date.now(),
      source: rawAssets.length > 0 ? 'vercel_blob' : 'local_fallback',
      storeConfigured: true,
      rawCount: rawAssets.length,
      images,
      rawAssets: prioritized.slice(0, 48),
    };
    return entityBlobCache;
  } catch (err) {
    console.warn('Vercel Blob raw image listing unavailable, falling back to local entity portraits:', err instanceof Error ? err.message : String(err));
    entityBlobCache = {
      fetchedAt: Date.now(),
      source: 'local_fallback',
      storeConfigured,
      rawCount: 0,
      images: fallbackImages,
      rawAssets: [],
    };
    return entityBlobCache;
  }
}

function getConfiguredEnvAdminPassword(): string | null {
  const val = process.env.ADMIN_PASSWORD?.trim();
  return val && val.length > 0 ? val : null;
}

function issueAdminSession(operator: {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
}): AdminSession {
  const token = crypto.randomBytes(32).toString('hex');
  const session: AdminSession = {
    token,
    operatorId: operator.id,
    username: operator.username,
    displayName: operator.displayName,
    role: operator.role,
    permissions: [...ROLE_PERMISSIONS[operator.role]],
    expiresAt: Date.now() + 8 * 60 * 60_000,
  };
  adminSessions.set(token, session);
  return session;
}

function extractAdminSession(req: Request): AdminSession | null {
  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return session;
}

function requireAdminPermission(permission: AdminPermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const session = extractAdminSession(req);
    if (!session) {
      res.status(401).json({ error: 'Admin authentication required.' });
      return;
    }
    if (!session.permissions.includes(permission)) {
      res.status(403).json({
        error: `Role ${session.role} lacks required permission: ${permission}.`,
      });
      return;
    }
    (req as Request & { adminSession?: AdminSession }).adminSession = session;
    next();
  };
}

function sanitizePlayerId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return PLAYER_ID_RE.test(trimmed) ? trimmed : null;
}

function sanitizePlatform(raw: unknown): 'desktop' | 'mobile' | 'tablet' {
  if (raw === 'mobile' || raw === 'tablet') return raw;
  return 'desktop';
}

function pickAiRite(turn: number, opponentCovenant: CovenantId): RiteId {
  const rites: RiteId[] = ['solari_strike', 'terra_guard', 'aether_channel', 'umbri_drain'];
  const preferred: Record<CovenantId, RiteId> = {
    Solari: 'solari_strike',
    Terra: 'terra_guard',
    Aether: 'aether_channel',
    Umbri: 'umbri_drain',
  };
  if (turn === 1) return preferred[opponentCovenant];
  return rites[(turn + Math.floor(Math.random() * rites.length)) % rites.length];
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Low-latency telemetry measurement for all /api/* requests
  app.use('/api', (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      store.recordLatency(req.path, elapsedMs);
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'glimmerfall-idle-api', timestamp: Date.now() });
  });

  // Raw entity artwork fetched server-side from Vercel Blob (strictly raw images, never TCG card frames)
  app.get('/api/entities/images', async (_req, res) => {
    const resolved = await resolveEntityRawImages();
    res.json({
      source: resolved.source,
      storeConfigured: resolved.storeConfigured,
      rawCount: resolved.rawCount,
      images: resolved.images,
    });
  });

  // Sync or bootstrap player state with offline/elapsed idle catch-up
  app.post('/api/player/sync', (req, res) => {
    const start = performance.now();
    const playerId = sanitizePlayerId(req.body?.playerId);
    if (!playerId) {
      res.status(400).json({ error: 'Valid playerId (6-64 alphanumeric chars) is required.' });
      return;
    }

    const playerName =
      typeof req.body?.playerName === 'string'
        ? req.body.playerName.replace(/[<>]/g, '').trim().slice(0, 28)
        : undefined;
    const covenant =
      typeof req.body?.covenant === 'string' && req.body.covenant in COVENANT_META
        ? (req.body.covenant as CovenantId)
        : undefined;
    const platform = sanitizePlatform(req.body?.platform);

    const { player: existing, isNew } = store.getOrCreatePlayer(playerId, playerName, covenant, platform);
    const elapsedSec = Math.max(0, (Date.now() - existing.lastUpdatedAt) / 1000);
    let updated = ensureCurrentDailyQuests(applyIdleTick(existing, elapsedSec));

    if (playerName && playerName.length >= 2) {
      updated = { ...updated, playerName };
    }
    if (covenant && isNew) {
      updated = { ...updated, covenant };
    }
    updated = { ...updated, platform };

    store.savePlayer(updated);
    const chain = store.getChain(playerId);

    if (isNew) {
      store.appendActivityLog({
        actorId: updated.playerId,
        actorName: updated.playerName,
        actorRole: 'PLAYER',
        category: 'gameplay',
        action: 'warden_awakened',
        summary: `New ${updated.covenant} Warden joined via ${platform}.`,
        platform,
        latencyMs: Math.round((performance.now() - start) * 10) / 10,
        blockHeight: chain[chain.length - 1]?.blockHeight,
      });
    }

    res.json({
      player: updated,
      production: calculateProduction(updated),
      chain,
      chainVerification: verifyChainIntegrity(chain),
    });
  });

  // Unified low-latency game action endpoint (harvest, entity upgrade, profession, zone, TCG card, NFT mint/equip, daily quests, wallet link, covenant)
  app.post('/api/player/action', (req, res) => {
    const start = performance.now();
    const playerId = sanitizePlayerId(req.body?.playerId);
    if (!playerId) {
      res.status(400).json({ error: 'Valid playerId is required.' });
      return;
    }

    const existing = store.getOrCreatePlayer(playerId).player;

    const elapsedSec = Math.max(0, (Date.now() - existing.lastUpdatedAt) / 1000);
    let current = ensureCurrentDailyQuests(applyIdleTick(existing, elapsedSec));

    const actionType = typeof req.body?.type === 'string' ? req.body.type : '';
    const payload = (req.body?.payload ?? {}) as Record<string, unknown>;

    let logCategory: 'gameplay' | 'blockchain' | 'nft' = 'gameplay';
    let logSummary = '';
    let shouldCommitBlock = false;

    if (actionType === 'harvest') {
      const taps = typeof payload.taps === 'number' ? payload.taps : 1;
      const result = applyManualHarvest(current, taps);
      current = result.state;
      logSummary = `Channeled ${Math.min(25, Math.max(1, Math.floor(taps)))} Glimmer Node(s) for +${result.gainedShards} shards.`;
    } else if (actionType === 'upgrade_entity' || actionType === 'upgrade_hero') {
      const entityId =
        typeof payload.entityId === 'string'
          ? payload.entityId
          : typeof payload.heroId === 'string'
            ? payload.heroId
            : '';
      const result = upgradeEntity(current, entityId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logSummary = `Upgraded entity ${entityId} to Lv.${current.entityLevels[entityId]}.`;
      shouldCommitBlock = true;
    } else if (actionType === 'upgrade_profession') {
      const professionId = typeof payload.professionId === 'string' ? payload.professionId : '';
      const result = upgradeProfession(current, professionId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logSummary = `Advanced artisan ${professionId} to Lv.${current.professionLevels[professionId]}.`;
    } else if (actionType === 'select_zone') {
      const zoneId = typeof payload.zoneId === 'string' ? payload.zoneId : '';
      const result = unlockOrSelectZone(current, zoneId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logSummary = `Entered mystical forest zone: ${zoneId}.`;
      shouldCommitBlock = true;
    } else if (actionType === 'toggle_tcg_card') {
      const cardId = typeof payload.cardId === 'string' ? payload.cardId : '';
      const result = toggleTcgCardSlot(current, cardId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logSummary = `Updated TCG Resonance Row with ${cardId}.`;
    } else if (actionType === 'mint_skin') {
      const skinId = typeof payload.skinId === 'string' ? payload.skinId : '';
      const result = mintNftSkin(current, skinId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logCategory = 'nft';
      logSummary = `Minted & equipped GlimmerFall ERC-721 skin ${skinId}.`;
      shouldCommitBlock = true;
    } else if (actionType === 'equip_skin') {
      const skinId = typeof payload.skinId === 'string' ? payload.skinId : '';
      const result = equipNftSkin(current, skinId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logCategory = 'nft';
      logSummary = `Equipped NFT entity skin ${skinId}.`;
      shouldCommitBlock = true;
    } else if (actionType === 'set_active_entity' || actionType === 'set_active_hero') {
      const entityId =
        typeof payload.entityId === 'string'
          ? payload.entityId
          : typeof payload.heroId === 'string'
            ? payload.heroId
            : '';
      if ((current.entityLevels[entityId] ?? 0) <= 0) {
        res.status(400).json({ error: 'Summon this entity before setting as active entity.' });
        return;
      }
      current = { ...current, activeEntityId: entityId, stateVersion: current.stateVersion + 1 };
      logSummary = `Set active forest entity to ${entityId}.`;
    } else if (actionType === 'claim_daily_quest') {
      const questId = typeof payload.questId === 'string' ? payload.questId : '';
      const result = claimDailyQuest(current, questId);
      if (!result.ok) {
        res.status(400).json({ error: result.error });
        return;
      }
      current = result.state;
      logSummary = `Claimed Daily Quest reward (${questId}).`;
      shouldCommitBlock = true;
    } else if (actionType === 'link_wallet') {
      const address = typeof payload.walletAddress === 'string' ? payload.walletAddress.trim() : '';
      if (!WALLET_RE.test(address)) {
        res.status(400).json({ error: 'Invalid EVM wallet address format.' });
        return;
      }
      current = { ...current, walletAddress: address, stateVersion: current.stateVersion + 1 };
      logCategory = 'blockchain';
      logSummary = `Linked Web3 wallet ${address.slice(0, 8)}…${address.slice(-4)}.`;
      shouldCommitBlock = true;
    } else if (actionType === 'switch_covenant') {
      const covenant = typeof payload.covenant === 'string' ? payload.covenant : '';
      if (!(covenant in COVENANT_META)) {
        res.status(400).json({ error: 'Invalid Covenant.' });
        return;
      }
      current = {
        ...current,
        covenant: covenant as CovenantId,
        stateVersion: current.stateVersion + 1,
      };
      logSummary = `Swore allegiance to the ${covenant} Covenant.`;
      shouldCommitBlock = true;
    } else if (actionType === 'rename_warden') {
      const name = typeof payload.playerName === 'string' ? payload.playerName.replace(/[<>]/g, '').trim().slice(0, 28) : '';
      if (name.length < 2) {
        res.status(400).json({ error: 'Warden name must be at least 2 characters.' });
        return;
      }
      current = { ...current, playerName: name, stateVersion: current.stateVersion + 1 };
      logSummary = `Renamed Warden to ${name}.`;
    } else {
      res.status(400).json({ error: 'Unsupported game action.' });
      return;
    }

    store.savePlayer(current);
    let committedBlock = null;
    if (shouldCommitBlock) {
      committedBlock = store.commitStateBlock(current, logSummary);
    }

    const chain = store.getChain(playerId);
    store.appendActivityLog({
      actorId: current.playerId,
      actorName: current.playerName,
      actorRole: 'PLAYER',
      category: logCategory,
      action: actionType,
      summary: logSummary,
      platform: current.platform,
      latencyMs: Math.round((performance.now() - start) * 10) / 10,
      blockHeight: committedBlock?.blockHeight ?? chain[chain.length - 1]?.blockHeight,
    });

    res.json({
      player: current,
      production: calculateProduction(current),
      chain,
      chainVerification: verifyChainIntegrity(chain),
      committedBlock,
    });
  });

  // Explicit blockchain state commitment endpoint
  app.post('/api/state/commit', (req, res) => {
    const start = performance.now();
    const playerId = sanitizePlayerId(req.body?.playerId);
    if (!playerId) {
      res.status(400).json({ error: 'Valid playerId is required.' });
      return;
    }
    const existing = store.getOrCreatePlayer(playerId).player;

    const elapsedSec = Math.max(0, (Date.now() - existing.lastUpdatedAt) / 1000);
    const ticked = ensureCurrentDailyQuests(applyIdleTick(existing, elapsedSec));
    const synced = {
      ...ticked,
      stateVersion: ticked.stateVersion + 1,
      dailyQuests: {
        ...ticked.dailyQuests,
        blocksAnchored: ticked.dailyQuests.blocksAnchored + 1,
      },
    };
    const note =
      typeof req.body?.note === 'string' && req.body.note.trim().length > 0
        ? req.body.note.replace(/[<>]/g, '').trim().slice(0, 80)
        : 'Manual GlimmerChain State Anchor';

    const block = store.commitStateBlock(synced, note);
    const chain = store.getChain(playerId);

    store.appendActivityLog({
      actorId: synced.playerId,
      actorName: synced.playerName,
      actorRole: 'PLAYER',
      category: 'blockchain',
      action: 'state_commit',
      summary: `Anchored Block #${block.blockHeight} · Root ${block.stateRoot.slice(0, 12)}…`,
      platform: synced.platform,
      latencyMs: Math.round((performance.now() - start) * 10) / 10,
      blockHeight: block.blockHeight,
    });

    res.json({
      player: synced,
      block,
      chain,
      chainVerification: verifyChainIntegrity(chain),
    });
  });

  // Competitive Matchmaking: find opponent & start Nexus Duel
  app.post('/api/matchmaking/queue', (req, res) => {
    const start = performance.now();
    const playerId = sanitizePlayerId(req.body?.playerId);
    if (!playerId) {
      res.status(400).json({ error: 'Valid playerId is required.' });
      return;
    }
    const existing = store.getOrCreatePlayer(playerId).player;
    const synced = applyIdleTick(existing, Math.max(0, (Date.now() - existing.lastUpdatedAt) / 1000));
    store.savePlayer(synced);

    const match = store.createRankedMatch(synced);
    store.appendActivityLog({
      actorId: synced.playerId,
      actorName: synced.playerName,
      actorRole: 'PLAYER',
      category: 'matchmaking',
      action: 'match_found',
      summary: `Matched vs ${match.opponentName} (${match.opponentCovenant}, ${match.opponentElo} Elo · ${match.opponentRegion}).`,
      platform: synced.platform,
      latencyMs: Math.round((performance.now() - start) * 10) / 10,
    });

    res.json({ match });
  });

  // Competitive Matchmaking: execute a tactical Covenant Rite turn
  app.post('/api/matchmaking/turn', (req, res) => {
    const start = performance.now();
    const playerId = sanitizePlayerId(req.body?.playerId);
    const matchId = typeof req.body?.matchId === 'string' ? req.body.matchId.trim() : '';
    const riteId = typeof req.body?.riteId === 'string' ? (req.body.riteId as RiteId) : null;

    if (!playerId || !matchId || !riteId || !(riteId in RITE_DEFINITIONS)) {
      res.status(400).json({ error: 'Valid playerId, matchId, and Covenant Rite are required.' });
      return;
    }

    const match = store.getMatch(matchId);
    if (!match || match.playerId !== playerId) {
      res.status(404).json({ error: 'Active Nexus match not found.' });
      return;
    }
    if (match.status !== 'active') {
      res.status(400).json({ error: 'Match already concluded.' });
      return;
    }

    const oppRite = pickAiRite(match.currentTurn, match.opponentCovenant);
    const updatedMatch = resolveNexusDuelTurn(match, riteId, oppRite);
    store.updateMatch(updatedMatch);

    let player = store.getOrCreatePlayer(playerId).player;
    let chain = store.getChain(playerId);

    if (updatedMatch.status !== 'active') {
      const normalizedPlayer = ensureCurrentDailyQuests(player);
      player = {
        ...normalizedPlayer,
        elo: Math.max(600, normalizedPlayer.elo + updatedMatch.eloDelta),
        wins: updatedMatch.status === 'victory' ? normalizedPlayer.wins + 1 : normalizedPlayer.wins,
        losses: updatedMatch.status === 'defeat' ? normalizedPlayer.losses + 1 : normalizedPlayer.losses,
        stateVersion: normalizedPlayer.stateVersion + 1,
        lastUpdatedAt: Date.now(),
        dailyQuests: {
          ...normalizedPlayer.dailyQuests,
          duelsCompleted: normalizedPlayer.dailyQuests.duelsCompleted + 1,
        },
        resources: {
          ...normalizedPlayer.resources,
          glimmerShards: normalizedPlayer.resources.glimmerShards + updatedMatch.rewardShards,
          totalGlimmerEarned: normalizedPlayer.resources.totalGlimmerEarned + updatedMatch.rewardShards,
          voidMotes: normalizedPlayer.resources.voidMotes + updatedMatch.rewardVoidMotes,
          nexusTrophies:
            updatedMatch.status === 'victory'
              ? normalizedPlayer.resources.nexusTrophies + 1
              : normalizedPlayer.resources.nexusTrophies,
        },
      };
      const block = store.commitStateBlock(
        player,
        `Nexus PvP ${updatedMatch.status.toUpperCase()} vs ${updatedMatch.opponentName} (${updatedMatch.eloDelta >= 0 ? '+' : ''}${updatedMatch.eloDelta} Elo)`,
      );
      chain = store.getChain(playerId);

      store.appendActivityLog({
        actorId: player.playerId,
        actorName: player.playerName,
        actorRole: 'PLAYER',
        category: 'matchmaking',
        action: 'match_complete',
        summary: `${updatedMatch.status.toUpperCase()} vs ${updatedMatch.opponentName} (${updatedMatch.eloDelta >= 0 ? '+' : ''}${updatedMatch.eloDelta} Elo, +${updatedMatch.rewardShards} shards).`,
        platform: player.platform,
        latencyMs: Math.round((performance.now() - start) * 10) / 10,
        blockHeight: block.blockHeight,
      });
    }

    res.json({
      match: updatedMatch,
      player,
      production: calculateProduction(player),
      chain,
      chainVerification: verifyChainIntegrity(chain),
    });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ leaderboard: store.getLeaderboard(15) });
  });

  // =========================================================================
  // HIDDEN DEVELOPER ADMIN PANEL API (/admin) — RBAC & Activity Logging
  // =========================================================================

  app.get('/api/admin/status', (_req, res) => {
    const envConfigured = Boolean(getConfiguredEnvAdminPassword());
    if (envConfigured) {
      res.json({ configured: true, mode: 'env_secret' });
      return;
    }
    if (store.hasBootstrapHash()) {
      res.json({ configured: true, mode: 'claimed_password' });
      return;
    }
    res.json({ configured: false, mode: 'bootstrap_required' });
  });

  // One-time first-run setup when process.env.ADMIN_PASSWORD is not set yet
  app.post('/api/admin/bootstrap', (req, res) => {
    if (getConfiguredEnvAdminPassword()) {
      res.status(403).json({ error: 'ADMIN_PASSWORD is already configured in server environment.' });
      return;
    }
    if (store.hasBootstrapHash()) {
      res.status(409).json({ error: 'Admin password has already been claimed.' });
      return;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (password.length < 8) {
      res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
      return;
    }

    const claimed = store.claimBootstrapPassword(password);
    if (!claimed) {
      res.status(409).json({ error: 'Admin password was already claimed.' });
      return;
    }

    const session = issueAdminSession({
      id: 'op_root',
      username: 'lead_architect',
      displayName: 'GlimmerFall Lead Architect',
      role: 'SUPER_ADMIN',
    });

    store.appendActivityLog({
      actorId: session.operatorId,
      actorName: session.displayName,
      actorRole: session.role,
      category: 'security',
      action: 'admin_bootstrap_claimed',
      summary: 'Initial admin passcode claimed via first-run setup.',
      platform: 'admin-console',
      latencyMs: 4,
    });

    res.json({
      token: session.token,
      operator: {
        id: session.operatorId,
        username: session.username,
        displayName: session.displayName,
        role: session.role,
        permissions: session.permissions,
      },
    });
  });

  app.post('/api/admin/login', (req, res) => {
    const start = performance.now();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';

    if (!password) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }

    // 1. Named RBAC operator login
    if (username && username.toLowerCase() !== 'lead_architect' && username.toLowerCase() !== 'admin') {
      const op = store.findOperatorByUsername(username);
      if (op && op.passwordSalt && op.passwordHash && verifyPasswordScrypt(password, op.passwordSalt, op.passwordHash)) {
        const session = issueAdminSession(op);
        store.appendActivityLog({
          actorId: op.id,
          actorName: op.displayName,
          actorRole: op.role,
          category: 'security',
          action: 'admin_login',
          summary: `RBAC operator ${op.username} (${op.role}) signed in.`,
          platform: 'admin-console',
          latencyMs: Math.round((performance.now() - start) * 10) / 10,
        });
        res.json({
          token: session.token,
          operator: {
            id: session.operatorId,
            username: session.username,
            displayName: session.displayName,
            role: session.role,
            permissions: session.permissions,
          },
        });
        return;
      }
      res.status(401).json({ error: 'Invalid operator credentials.' });
      return;
    }

    // 2. Primary Super Admin login (process.env.ADMIN_PASSWORD takes priority over claimed bootstrap hash)
    const envSecret = getConfiguredEnvAdminPassword();
    let authorized = false;
    if (envSecret) {
      authorized = timingSafeEqualSecret(password, envSecret);
    } else if (store.hasBootstrapHash()) {
      authorized = store.verifyBootstrapPassword(password);
    } else {
      res.status(409).json({ error: 'Admin password not yet claimed. Complete initial setup first.' });
      return;
    }

    if (!authorized) {
      store.appendActivityLog({
        actorId: 'unknown',
        actorName: username || 'Super Admin',
        actorRole: 'PLAYER',
        category: 'security',
        action: 'admin_login_denied',
        summary: 'Failed /admin authentication attempt blocked.',
        platform: 'admin-console',
        latencyMs: Math.round((performance.now() - start) * 10) / 10,
      });
      res.status(401).json({ error: 'Invalid admin password.' });
      return;
    }

    const session = issueAdminSession({
      id: 'op_root',
      username: 'lead_architect',
      displayName: 'GlimmerFall Lead Architect',
      role: 'SUPER_ADMIN',
    });

    store.appendActivityLog({
      actorId: session.operatorId,
      actorName: session.displayName,
      actorRole: session.role,
      category: 'security',
      action: 'admin_login',
      summary: 'Super Admin authenticated to developer analytics console.',
      platform: 'admin-console',
      latencyMs: Math.round((performance.now() - start) * 10) / 10,
    });

    res.json({
      token: session.token,
      operator: {
        id: session.operatorId,
        username: session.username,
        displayName: session.displayName,
        role: session.role,
        permissions: session.permissions,
      },
    });
  });

  app.post('/api/admin/logout', (req, res) => {
    const header = req.header('authorization') ?? '';
    if (header.startsWith('Bearer ')) {
      adminSessions.delete(header.slice('Bearer '.length).trim());
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/analytics', requireAdminPermission('view_analytics'), (_req, res) => {
    res.json({
      analytics: store.getAnalytics(),
      players: store.getAllPlayersSummary(),
      roleMatrix: ROLE_PERMISSIONS,
    });
  });

  app.get('/api/admin/logs', requireAdminPermission('view_audit_logs'), (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category : 'all';
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const limit = Number(req.query.limit) || 100;
    res.json({ logs: store.getActivityLogs({ category, search, limit }) });
  });

  app.get('/api/admin/roles', requireAdminPermission('view_analytics'), (_req, res) => {
    res.json({ operators: store.getOperators(), roleMatrix: ROLE_PERMISSIONS });
  });

  app.post('/api/admin/roles', requireAdminPermission('manage_roles'), (req, res) => {
    const adminSession = (req as Request & { adminSession?: AdminSession }).adminSession!;
    const username = typeof req.body?.username === 'string' ? req.body.username : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
    const role = typeof req.body?.role === 'string' ? (req.body.role as AdminRole) : 'ANALYST';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const result = store.createOperator({ username, displayName, role, password });
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }

    store.appendActivityLog({
      actorId: adminSession.operatorId,
      actorName: adminSession.displayName,
      actorRole: adminSession.role,
      category: 'admin',
      action: 'rbac_operator_created',
      summary: `Created ${role} operator @${result.operator!.username}.`,
      platform: 'admin-console',
      latencyMs: 3,
    });

    res.status(201).json({ operator: result.operator, operators: store.getOperators() });
  });

  app.patch('/api/admin/roles/:operatorId', requireAdminPermission('manage_roles'), (req, res) => {
    const adminSession = (req as Request & { adminSession?: AdminSession }).adminSession!;
    const operatorId = req.params.operatorId;
    const role = typeof req.body?.role === 'string' ? (req.body.role as AdminRole) : null;
    const active = typeof req.body?.active === 'boolean' ? req.body.active : undefined;

    if (!role || !(role in ROLE_PERMISSIONS)) {
      res.status(400).json({ error: 'Valid RBAC role is required.' });
      return;
    }

    const updated = store.updateOperatorRole(operatorId, role, active);
    if (!updated) {
      res.status(400).json({ error: 'Unable to update operator (not found or root super admin protected).' });
      return;
    }

    store.appendActivityLog({
      actorId: adminSession.operatorId,
      actorName: adminSession.displayName,
      actorRole: adminSession.role,
      category: 'admin',
      action: 'rbac_role_updated',
      summary: `Updated @${updated.username} -> ${updated.role} (${updated.active ? 'active' : 'revoked'}).`,
      platform: 'admin-console',
      latencyMs: 3,
    });

    res.json({ operator: updated, operators: store.getOperators() });
  });

  app.post('/api/admin/players/:playerId/grant', requireAdminPermission('adjust_economy'), (req, res) => {
    const adminSession = (req as Request & { adminSession?: AdminSession }).adminSession!;
    const playerId = sanitizePlayerId(req.params.playerId);
    const shards = Number(req.body?.shards);
    if (!playerId || !Number.isFinite(shards) || shards <= 0 || shards > 50000) {
      res.status(400).json({ error: 'Provide valid playerId and shard grant (1–50,000).' });
      return;
    }

    const player = store.getPlayer(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }

    const updated = {
      ...player,
      stateVersion: player.stateVersion + 1,
      lastUpdatedAt: Date.now(),
      resources: {
        ...player.resources,
        glimmerShards: player.resources.glimmerShards + Math.round(shards),
        totalGlimmerEarned: player.resources.totalGlimmerEarned + Math.round(shards),
      },
    };
    const block = store.commitStateBlock(updated, `Admin Event Grant (+${Math.round(shards)} Glimmer Shards)`);

    store.appendActivityLog({
      actorId: adminSession.operatorId,
      actorName: adminSession.displayName,
      actorRole: adminSession.role,
      category: 'admin',
      action: 'economy_grant',
      summary: `Granted +${Math.round(shards)} Glimmer Shards to ${updated.playerName}.`,
      platform: 'admin-console',
      latencyMs: 4,
      blockHeight: block.blockHeight,
    });

    res.json({ ok: true, players: store.getAllPlayersSummary() });
  });

  app.post('/api/admin/players/:playerId/flag', requireAdminPermission('moderate_players'), (req, res) => {
    const adminSession = (req as Request & { adminSession?: AdminSession }).adminSession!;
    const playerId = sanitizePlayerId(req.params.playerId);
    if (!playerId) {
      res.status(400).json({ error: 'Valid playerId is required.' });
      return;
    }

    const player = store.getPlayer(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found.' });
      return;
    }

    const nextFlagged = !player.flagged;
    const updated = { ...player, flagged: nextFlagged };
    store.savePlayer(updated);

    store.appendActivityLog({
      actorId: adminSession.operatorId,
      actorName: adminSession.displayName,
      actorRole: adminSession.role,
      category: 'admin',
      action: nextFlagged ? 'player_flagged' : 'player_cleared',
      summary: `${nextFlagged ? 'Flagged' : 'Cleared'} ${updated.playerName} (${updated.playerId}).`,
      platform: 'admin-console',
      latencyMs: 3,
    });

    res.json({ ok: true, players: store.getAllPlayersSummary() });
  });

  // Serve Vite in dev or built static bundle in production (with SPA fallback for /admin and /)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.resolve(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GlimmerFall IDLE server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start GlimmerFall server:', err);
  process.exit(1);
});
