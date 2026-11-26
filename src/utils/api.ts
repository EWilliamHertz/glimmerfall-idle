import type {
  ActivityLogEntry,
  AdminOperator,
  AdminPermission,
  AdminRole,
  AnalyticsSnapshot,
  CovenantId,
  LeaderboardEntry,
  NexusMatch,
  PlayerState,
  ProductionBreakdown,
  RiteId,
  StateBlock,
} from '../game/types';
import type { ChainVerificationResult } from '../game/chain';

export interface SyncResponse {
  player: PlayerState;
  production: ProductionBreakdown;
  chain: StateBlock[];
  chainVerification: ChainVerificationResult;
  committedBlock?: StateBlock | null;
}

export interface AdminLoginResponse {
  token: string;
  operator: {
    id: string;
    username: string;
    displayName: string;
    role: AdminRole;
    permissions: AdminPermission[];
  };
}

export interface AdminPlayerRow {
  playerId: string;
  playerName: string;
  covenant: CovenantId;
  platform: 'desktop' | 'mobile' | 'tablet';
  glimmerShards: number;
  totalGlimmerEarned: number;
  elo: number;
  wins: number;
  losses: number;
  ownedSkins: number;
  blockHeight: number;
  stateRoot: string;
  lastUpdatedAt: number;
  flagged: boolean;
}

async function parseJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  let data: Record<string, unknown> | null = null;
  if (contentType.includes('application/json')) {
    data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  } else {
    const text = await res.text().catch(() => '');
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Request failed (${res.status})`,
    );
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected non-JSON response from GlimmerFall API.');
  }
  return data as T;
}

function assertSyncPayload(data: SyncResponse): SyncResponse {
  if (!data || !data.player || !data.player.resources || !data.player.activeZoneId) {
    throw new Error('Incomplete player state returned from API.');
  }
  return data;
}

export function detectClientPlatform(): 'desktop' | 'mobile' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function getOrCreateLocalPlayerId(): string {
  const key = 'glimmerfall_warden_id';
  try {
    const existing = window.localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{6,64}$/.test(existing)) {
      return existing;
    }
    const created = `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return `gf_session_${Date.now().toString(36)}`;
  }
}

export async function syncPlayer(params: {
  playerId: string;
  playerName?: string;
  covenant?: CovenantId;
  platform: 'desktop' | 'mobile' | 'tablet';
}): Promise<SyncResponse> {
  const res = await fetch('/api/player/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return assertSyncPayload(await parseJson<SyncResponse>(res));
}

export async function sendPlayerAction(
  playerId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<SyncResponse> {
  const res = await fetch('/api/player/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, type, payload }),
  });
  return assertSyncPayload(await parseJson<SyncResponse>(res));
}

export async function commitStateBlock(playerId: string, note?: string): Promise<SyncResponse & { block: StateBlock }> {
  const res = await fetch('/api/state/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, note }),
  });
  const data = await parseJson<SyncResponse & { block: StateBlock }>(res);
  assertSyncPayload(data);
  return data;
}

export async function joinMatchmaking(playerId: string): Promise<{ match: NexusMatch }> {
  const res = await fetch('/api/matchmaking/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  return parseJson<{ match: NexusMatch }>(res);
}

export async function submitMatchTurn(
  playerId: string,
  matchId: string,
  riteId: RiteId,
): Promise<{ match: NexusMatch } & SyncResponse> {
  const res = await fetch('/api/matchmaking/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, matchId, riteId }),
  });
  const data = await parseJson<{ match: NexusMatch } & SyncResponse>(res);
  assertSyncPayload(data);
  return data;
}

export async function fetchLeaderboard(): Promise<{ leaderboard: LeaderboardEntry[] }> {
  const res = await fetch('/api/leaderboard');
  return parseJson<{ leaderboard: LeaderboardEntry[] }>(res);
}

export interface EntityRawImagesResponse {
  source: 'vercel_blob' | 'local_fallback';
  storeConfigured: boolean;
  rawCount: number;
  images: Record<string, string>;
}

export async function fetchEntityRawImages(): Promise<EntityRawImagesResponse> {
  const res = await fetch('/api/entities/images');
  return parseJson<EntityRawImagesResponse>(res);
}

// Admin API helpers — Bearer token stays strictly in React memory (never persisted in storage)
export async function fetchAdminStatus(): Promise<{
  configured: boolean;
  mode: 'env_secret' | 'claimed_password' | 'bootstrap_required';
}> {
  const res = await fetch('/api/admin/status');
  return parseJson(res);
}

export async function claimAdminBootstrap(password: string): Promise<AdminLoginResponse> {
  const res = await fetch('/api/admin/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  return parseJson<AdminLoginResponse>(res);
}

export async function adminLogin(password: string, username?: string): Promise<AdminLoginResponse> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, username }),
  });
  return parseJson<AdminLoginResponse>(res);
}

export async function adminLogout(token: string): Promise<void> {
  await fetch('/api/admin/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminAnalytics(token: string): Promise<{
  analytics: AnalyticsSnapshot;
  players: AdminPlayerRow[];
  roleMatrix: Record<AdminRole, AdminPermission[]>;
}> {
  const res = await fetch('/api/admin/analytics', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function fetchAdminLogs(
  token: string,
  category = 'all',
  search = '',
): Promise<{ logs: ActivityLogEntry[] }> {
  const qs = new URLSearchParams({ category, search, limit: '120' });
  const res = await fetch(`/api/admin/logs?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function fetchAdminRoles(token: string): Promise<{
  operators: AdminOperator[];
  roleMatrix: Record<AdminRole, AdminPermission[]>;
}> {
  const res = await fetch('/api/admin/roles', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}

export async function createAdminOperator(
  token: string,
  input: { username: string; displayName: string; role: AdminRole; password: string },
): Promise<{ operator: AdminOperator; operators: AdminOperator[] }> {
  const res = await fetch('/api/admin/roles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function updateAdminOperator(
  token: string,
  operatorId: string,
  input: { role: AdminRole; active?: boolean },
): Promise<{ operator: AdminOperator; operators: AdminOperator[] }> {
  const res = await fetch(`/api/admin/roles/${encodeURIComponent(operatorId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  return parseJson(res);
}

export async function grantPlayerShards(
  token: string,
  playerId: string,
  shards: number,
): Promise<{ ok: boolean; players: AdminPlayerRow[] }> {
  const res = await fetch(`/api/admin/players/${encodeURIComponent(playerId)}/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ shards }),
  });
  return parseJson(res);
}

export async function togglePlayerFlag(
  token: string,
  playerId: string,
): Promise<{ ok: boolean; players: AdminPlayerRow[] }> {
  const res = await fetch(`/api/admin/players/${encodeURIComponent(playerId)}/flag`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(res);
}
