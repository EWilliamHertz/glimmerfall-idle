import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Download,
  Lock,
  LogOut,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react';
import { COVENANT_META } from '../game/catalog';
import { formatCompactNumber } from '../game/engine';
import type {
  ActivityLogEntry,
  AdminOperator,
  AdminPermission,
  AdminRole,
  AnalyticsSnapshot,
  CovenantId,
} from '../game/types';
import {
  adminLogin,
  adminLogout,
  claimAdminBootstrap,
  createAdminOperator,
  fetchAdminAnalytics,
  fetchAdminLogs,
  fetchAdminRoles,
  fetchAdminStatus,
  grantPlayerShards,
  togglePlayerFlag,
  updateAdminOperator,
  type AdminLoginResponse,
  type AdminPlayerRow,
} from '../utils/api';

type AdminSection = 'analytics' | 'logs' | 'rbac' | 'players';

const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'GAME_DESIGNER', 'ANALYST', 'MODERATOR'];
const LOG_CATEGORIES = ['all', 'gameplay', 'blockchain', 'nft', 'matchmaking', 'admin', 'security'] as const;

function escapeCsvCell(val: string | number | undefined): string {
  const s = String(val ?? '');
  const formulaSafe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

export function AdminDashboard() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'env_secret' | 'claimed_password' | 'bootstrap_required'>('loading');
  const [session, setSession] = useState<AdminLoginResponse | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [section, setSection] = useState<AdminSection>('analytics');
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [players, setPlayers] = useState<AdminPlayerRow[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [operators, setOperators] = useState<AdminOperator[]>([]);
  const [roleMatrix, setRoleMatrix] = useState<Record<AdminRole, AdminPermission[]> | null>(null);
  const [logCategory, setLogCategory] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create RBAC operator form
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpName, setNewOpName] = useState('');
  const [newOpRole, setNewOpRole] = useState<AdminRole>('ANALYST');
  const [newOpPassword, setNewOpPassword] = useState('');

  useEffect(() => {
    document.title = 'GlimmerFall Developer Analytics';
    void fetchAdminStatus()
      .then((res) => setAuthStatus(res.mode))
      .catch(() => setAuthStatus('env_secret'));
  }, []);

  const loadAdminData = useCallback(async (token: string, cat = logCategory, search = logSearch) => {
    try {
      const [anRes, logRes, roleRes] = await Promise.all([
        fetchAdminAnalytics(token),
        fetchAdminLogs(token, cat, search),
        fetchAdminRoles(token),
      ]);
      setAnalytics(anRes.analytics);
      setPlayers(anRes.players);
      setRoleMatrix(anRes.roleMatrix);
      setLogs(logRes.logs);
      setOperators(roleRes.operators);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to refresh analytics.');
    }
  }, [logCategory, logSearch]);

  useEffect(() => {
    if (!session) return;
    void loadAdminData(session.token);
    const id = window.setInterval(() => {
      void loadAdminData(session.token);
    }, 6000);
    return () => window.clearInterval(id);
  }, [session, loadAdminData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const res = await adminLogin(password, username.trim() || undefined);
      setSession(res);
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthBusy(true);
    try {
      const res = await claimAdminBootstrap(password);
      setSession(res);
      setPassword('');
      setConfirmPassword('');
      setAuthStatus('claimed_password');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (session) {
      await adminLogout(session.token).catch(() => {});
    }
    setSession(null);
    setAnalytics(null);
    setLogs([]);
  };

  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Role', 'Category', 'Action', 'Summary', 'Platform', 'LatencyMs'];
    const rows = logs.map((l) => [
      new Date(l.timestamp).toISOString(),
      l.actorName,
      l.actorRole,
      l.category,
      l.action,
      l.summary,
      l.platform,
      l.latencyMs,
    ]);
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map((r) => r.map(escapeCsvCell).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glimmerfall-activity-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasPerm = (perm: AdminPermission) => Boolean(session?.operator.permissions.includes(perm));

  if (!session) {
    return (
      <main className="min-h-screen bg-[#090E11] text-[#E6EDF0] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-xl bg-[#10181D] border border-[#22313A] p-6 sm:p-8 space-y-6">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#E6A832]">
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>GlimmerFall Developer Console</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-[#F5F7F8]">
              {authStatus === 'bootstrap_required'
                ? 'Initialize Admin Access'
                : 'Developer Analytics Sign In'}
            </h1>
            <p className="text-xs text-[#94A7B2] leading-relaxed">
              {authStatus === 'bootstrap_required'
                ? 'No ADMIN_PASSWORD environment secret is active yet. Claim the initial Super Admin passcode below to lock this console, or set ADMIN_PASSWORD in your deployment Secrets.'
                : 'Authenticate with the server ADMIN_PASSWORD or an assigned RBAC operator account.'}
            </p>
          </div>

          {authStatus === 'loading' ? (
            <div className="py-8 text-center text-xs font-mono text-[#94A7B2]">
              Verifying console security state…
            </div>
          ) : authStatus === 'bootstrap_required' ? (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="admin-claim-pass" className="block text-xs font-medium text-[#C5D2D9]">
                  New Super Admin Password
                </label>
                <input
                  id="admin-claim-pass"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0A1014] border border-[#263842] text-sm text-white focus:outline-none focus:border-[#E6A832]"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="admin-claim-confirm" className="block text-xs font-medium text-[#C5D2D9]">
                  Confirm Password
                </label>
                <input
                  id="admin-claim-confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0A1014] border border-[#263842] text-sm text-white focus:outline-none focus:border-[#E6A832]"
                  placeholder="Re-enter password"
                />
              </div>
              {authError && (
                <p role="alert" className="text-xs text-[#F28B82]">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] font-bold text-sm transition-colors"
              >
                {authBusy ? 'Claiming Console…' : 'Claim Super Admin Access'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="admin-username" className="block text-xs font-medium text-[#C5D2D9]">
                  Operator Username (optional for Super Admin)
                </label>
                <input
                  id="admin-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0A1014] border border-[#263842] text-sm text-white focus:outline-none focus:border-[#E6A832]"
                  placeholder="Leave blank for Super Admin"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="admin-password" className="block text-xs font-medium text-[#C5D2D9]">
                  Admin Password
                </label>
                <input
                  id="admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0A1014] border border-[#263842] text-sm text-white focus:outline-none focus:border-[#E6A832]"
                  placeholder="Enter ADMIN_PASSWORD"
                />
              </div>
              {authError && (
                <p role="alert" className="text-xs text-[#F28B82]">
                  {authError}
                </p>
              )}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] font-bold text-sm transition-colors"
              >
                {authBusy ? 'Authenticating…' : 'Sign In to Analytics'}
              </button>
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#090E11] text-[#E6EDF0] flex flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full lg:w-64 shrink-0 bg-[#0D1419] border-b lg:border-b-0 lg:border-r border-[#1D2B33] p-5 flex flex-col justify-between gap-6">
        <div className="space-y-6">
          <div>
            <div className="font-display text-lg font-bold text-[#F5F7F8]">GlimmerFall Dev</div>
            <div className="text-xs text-[#8BA0AC] mt-0.5">
              {session.operator.displayName} · {session.operator.role}
            </div>
          </div>

          <nav aria-label="Admin sections" className="flex lg:flex-col gap-1.5 overflow-x-auto">
            {(
              [
                ['analytics', 'Live Analytics', BarChart3],
                ['logs', 'Activity Logs', Activity],
                ['rbac', 'RBAC & Roles', Shield],
                ['players', 'Players & Economy', Users],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  section === id
                    ? 'bg-[#192831] text-[#FFF7E2]'
                    : 'text-[#8FA4B0] hover:text-white hover:bg-[#131E25]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-[#C9D5DC] border border-[#253640] hover:border-[#425D6D] hover:text-white transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign Out
        </button>
      </aside>

      {/* Main Analytics Workspace */}
      <main className="flex-1 min-w-0 p-5 sm:p-8 space-y-6 max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1B2830] pb-4">
          <div>
            <div className="text-xs text-[#8BA0AC]">GlimmerFall IDLE / Admin Console</div>
            <h1 className="font-display text-2xl font-bold text-[#F5F7F8] mt-0.5">
              {section === 'analytics' && 'Real-Time Game Analytics'}
              {section === 'logs' && 'User & Operator Activity Logs'}
              {section === 'rbac' && 'Role-Based Access Control'}
              {section === 'players' && 'Player Economy & Moderation'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadAdminData(session.token)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-[#132028] border border-[#243742] text-[#D8E3E8] hover:text-white whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              Refresh Data
            </button>
          </div>
        </header>

        {feedback && (
          <div className="px-4 py-2.5 rounded-lg bg-[#16252E] border border-[#2B4352] text-xs text-[#D8E8F0] flex items-center justify-between gap-2">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-[#8FA4B0] hover:text-white">
              Dismiss
            </button>
          </div>
        )}

        {/* Section 1: Real-Time Analytics */}
        {section === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Wardens', value: analytics.totalPlayers, sub: `${analytics.activePlayersLast15m} active (15m)` },
                { label: 'Glimmer Circulation', value: formatCompactNumber(analytics.totalGlimmerCirculation), sub: `${analytics.totalStateBlocks} state blocks` },
                { label: 'API Latency (p50 / p95)', value: `${analytics.apiTelemetry.p50LatencyMs}ms / ${analytics.apiTelemetry.p95LatencyMs}ms`, sub: `${analytics.apiTelemetry.requestsLastMinute} req/min` },
                { label: 'Matches & NFTs', value: `${analytics.matchesCompleted} duels`, sub: `${analytics.totalNftsMinted} NFTs minted` },
              ].map((kpi) => (
                <div key={kpi.label} className="p-4 rounded-xl bg-[#10181D] border border-[#1E2D36]">
                  <div className="text-xs text-[#8BA0AC]">{kpi.label}</div>
                  <div className="font-mono text-xl font-semibold tabular-nums text-[#F5F7F8] mt-1">
                    {kpi.value}
                  </div>
                  <div className="text-xs font-mono tabular-nums text-[#6EA58C] mt-1">{kpi.sub}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl bg-[#10181D] border border-[#1E2D36] space-y-4">
                <h2 className="font-display text-lg font-bold text-[#F5F7F8]">
                  Covenant Distribution
                </h2>
                <div className="space-y-3">
                  {(['Solari', 'Terra', 'Aether', 'Umbri'] as CovenantId[]).map((cov) => {
                    const count = analytics.covenantDistribution[cov] ?? 0;
                    const pct = analytics.totalPlayers > 0 ? Math.round((count / analytics.totalPlayers) * 100) : 0;
                    return (
                      <div key={cov} className="space-y-1">
                        <div className="flex justify-between text-xs font-mono tabular-nums">
                          <span style={{ color: COVENANT_META[cov].accentHex }}>{cov}</span>
                          <span className="text-[#C5D2D9]">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-[#19252D] overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: COVENANT_META[cov].accentHex,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-[#10181D] border border-[#1E2D36] space-y-4">
                <h2 className="font-display text-lg font-bold text-[#F5F7F8]">
                  Cross-Platform &amp; NFT Skin Telemetry
                </h2>
                <div className="grid grid-cols-3 gap-3 pb-3 border-b border-[#1C2A32]">
                  {(['desktop', 'mobile', 'tablet'] as const).map((plat) => (
                    <div key={plat}>
                      <div className="text-xs text-[#8BA0AC] capitalize">{plat}</div>
                      <div className="font-mono text-lg font-semibold tabular-nums text-[#F5F7F8]">
                        {analytics.platformBreakdown[plat]}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {analytics.skinAdoption.slice(0, 4).map((s) => (
                    <div key={s.skinId} className="flex justify-between text-xs">
                      <span className="text-[#C5D2D9]">{s.name}</span>
                      <span className="font-mono tabular-nums text-[#E6A832]">{s.count} minted</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Detailed User Activity Logging */}
        {section === 'logs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#10181D] border border-[#1E2D36]">
                {LOG_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setLogCategory(cat);
                      void loadAdminData(session.token, cat, logSearch);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                      logCategory === cat
                        ? 'bg-[#1D2F3A] text-white'
                        : 'text-[#8FA4B0] hover:text-white'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="search"
                  aria-label="Search activity logs"
                  value={logSearch}
                  onChange={(e) => {
                    const next = e.target.value;
                    setLogSearch(next);
                    void loadAdminData(session.token, logCategory, next);
                  }}
                  placeholder="Filter actor or event…"
                  className="px-3 py-2 rounded-lg bg-[#10181D] border border-[#22333D] text-xs text-white focus:outline-none focus:border-[#E6A832]"
                />
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#192831] hover:bg-[#223642] text-xs font-semibold text-[#E6EDF0] whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-[#10181D] border border-[#1E2D36] overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#1D2C35] text-[#8BA0AC]">
                    <th className="py-3 px-4 font-medium">Time</th>
                    <th className="py-3 px-4 font-medium">Actor</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium">Action &amp; Summary</th>
                    <th className="py-3 px-4 font-medium text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#17232B]">
                  {logs.map((entry) => (
                    <tr key={entry.id} className="hover:bg-[#131E25]">
                      <td className="py-2.5 px-4 font-mono tabular-nums text-[#8BA0AC] whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 text-[#E6EDF0] whitespace-nowrap">
                        {entry.actorName}
                        <span className="text-[#788D99] ml-1.5 font-mono">({entry.actorRole})</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[#E6A832] capitalize whitespace-nowrap">
                        {entry.category}
                      </td>
                      <td className="py-2.5 px-4 text-[#C5D2D9]">
                        <span className="font-mono text-[#7DD3B0] mr-2">{entry.action}</span>
                        {entry.summary}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#8BA0AC] whitespace-nowrap">
                        {entry.latencyMs}ms
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#8BA0AC]">
                        No activity events match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 3: RBAC Management */}
        {section === 'rbac' && (
          <div className="space-y-6">
            {roleMatrix && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {ADMIN_ROLES.map((role) => (
                  <div key={role} className="p-4 rounded-xl bg-[#10181D] border border-[#1E2D36] space-y-2">
                    <div className="font-mono text-xs font-semibold text-[#E6A832]">{role}</div>
                    <div className="text-xs text-[#9BB0BC] leading-relaxed">
                      {roleMatrix[role].join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-xl bg-[#10181D] border border-[#1E2D36] overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1D2C35] text-[#8BA0AC]">
                      <th className="py-3 px-4 font-medium">Operator</th>
                      <th className="py-3 px-4 font-medium">Role</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#17232B]">
                    {operators.map((op) => (
                      <tr key={op.id}>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#F5F7F8]">{op.displayName}</div>
                          <div className="font-mono text-[#7E94A1]">@{op.username}</div>
                        </td>
                        <td className="py-3 px-4">
                          <select
                            aria-label={`Role for ${op.username}`}
                            value={op.role}
                            disabled={!hasPerm('manage_roles') || op.id === 'op_root'}
                            onChange={async (e) => {
                              try {
                                const res = await updateAdminOperator(session.token, op.id, {
                                  role: e.target.value as AdminRole,
                                });
                                setOperators(res.operators);
                                setFeedback(`Updated @${op.username} role to ${e.target.value}.`);
                              } catch (err) {
                                setFeedback(err instanceof Error ? err.message : 'Role update denied.');
                              }
                            }}
                            className="px-2.5 py-1.5 rounded bg-[#0A1014] border border-[#253742] font-mono text-xs text-white"
                          >
                            {ADMIN_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className={op.active ? 'text-[#5CE0A4]' : 'text-[#F28B82]'}>
                            {op.active ? 'Active' : 'Revoked'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {op.id !== 'op_root' && hasPerm('manage_roles') && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const res = await updateAdminOperator(session.token, op.id, {
                                    role: op.role,
                                    active: !op.active,
                                  });
                                  setOperators(res.operators);
                                  setFeedback(`${op.active ? 'Revoked' : 'Restored'} @${op.username}.`);
                                } catch (err) {
                                  setFeedback(err instanceof Error ? err.message : 'Action failed.');
                                }
                              }}
                              className="px-3 py-1.5 rounded bg-[#18262F] hover:bg-[#233744] text-xs font-semibold text-[#D8E3E8]"
                            >
                              {op.active ? 'Revoke' : 'Restore'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-5 rounded-xl bg-[#10181D] border border-[#1E2D36] space-y-4">
                <h3 className="font-display text-lg font-bold text-[#F5F7F8]">Add RBAC Operator</h3>
                {!hasPerm('manage_roles') ? (
                  <p className="text-xs text-[#8BA0AC]">
                    Your current role ({session.operator.role}) does not include manage_roles permission.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        const res = await createAdminOperator(session.token, {
                          username: newOpUsername,
                          displayName: newOpName,
                          role: newOpRole,
                          password: newOpPassword,
                        });
                        setOperators(res.operators);
                        setNewOpUsername('');
                        setNewOpName('');
                        setNewOpPassword('');
                        setFeedback(`Created RBAC operator @${res.operator.username} (${res.operator.role}).`);
                      } catch (err) {
                        setFeedback(err instanceof Error ? err.message : 'Unable to create operator.');
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label htmlFor="op-user" className="block text-xs text-[#9BB0BC] mb-1">
                        Username
                      </label>
                      <input
                        id="op-user"
                        type="text"
                        required
                        value={newOpUsername}
                        onChange={(e) => setNewOpUsername(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0A1014] border border-[#243640] text-xs text-white"
                        placeholder="e.g. lore_analyst"
                      />
                    </div>
                    <div>
                      <label htmlFor="op-name" className="block text-xs text-[#9BB0BC] mb-1">
                        Display Name
                      </label>
                      <input
                        id="op-name"
                        type="text"
                        required
                        value={newOpName}
                        onChange={(e) => setNewOpName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0A1014] border border-[#243640] text-xs text-white"
                        placeholder="GlimmerFall Analyst"
                      />
                    </div>
                    <div>
                      <label htmlFor="op-role" className="block text-xs text-[#9BB0BC] mb-1">
                        Role
                      </label>
                      <select
                        id="op-role"
                        value={newOpRole}
                        onChange={(e) => setNewOpRole(e.target.value as AdminRole)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0A1014] border border-[#243640] text-xs font-mono text-white"
                      >
                        {ADMIN_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="op-pass" className="block text-xs text-[#9BB0BC] mb-1">
                        Temporary Passcode
                      </label>
                      <input
                        id="op-pass"
                        type="password"
                        required
                        minLength={8}
                        value={newOpPassword}
                        onChange={(e) => setNewOpPassword(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0A1014] border border-[#243640] text-xs text-white"
                        placeholder="Min 8 characters"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-4 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold"
                    >
                      Create Operator
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Section 4: Players & Economy Controls */}
        {section === 'players' && (
          <div className="rounded-xl bg-[#10181D] border border-[#1E2D36] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#1D2C35] text-[#8BA0AC]">
                  <th className="py-3 px-4 font-medium">Warden</th>
                  <th className="py-3 px-4 font-medium">Covenant / Platform</th>
                  <th className="py-3 px-4 font-medium text-right">Glimmer</th>
                  <th className="py-3 px-4 font-medium text-right">Elo</th>
                  <th className="py-3 px-4 font-medium text-right">Block</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17232B]">
                {players.map((p) => (
                  <tr key={p.playerId} className="hover:bg-[#131E25]">
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#F5F7F8]">
                        {p.playerName}
                        {p.flagged && <span className="ml-2 text-[#F28B82] font-mono">FLAGGED</span>}
                      </div>
                      <div className="font-mono text-[#788D99]">{p.playerId}</div>
                    </td>
                    <td className="py-3 px-4 text-[#C5D2D9]">
                      <span style={{ color: COVENANT_META[p.covenant].accentHex }}>{p.covenant}</span> · {p.platform}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#F5F7F8]">
                      {formatCompactNumber(p.glimmerShards)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#E6A832]">
                      {p.elo}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#7DD3B0]">
                      #{p.blockHeight}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      {hasPerm('adjust_economy') && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await grantPlayerShards(session.token, p.playerId, 500);
                              setPlayers(res.players);
                              setFeedback(`Granted +500 Glimmer Shards to ${p.playerName}.`);
                            } catch (err) {
                              setFeedback(err instanceof Error ? err.message : 'Grant failed.');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded bg-[#1B2F27] hover:bg-[#254236] text-[#7DD3B0] font-semibold"
                        >
                          +500 Shards
                        </button>
                      )}
                      {hasPerm('moderate_players') && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await togglePlayerFlag(session.token, p.playerId);
                              setPlayers(res.players);
                              setFeedback(`Updated moderation flag for ${p.playerName}.`);
                            } catch (err) {
                              setFeedback(err instanceof Error ? err.message : 'Flag update failed.');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded bg-[#2A1D21] hover:bg-[#3A272D] text-[#F2A6A0] font-semibold"
                        >
                          {p.flagged ? 'Clear Flag' : 'Flag'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
