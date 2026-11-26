import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import type { User } from 'firebase/auth';
import { COVENANT_META, TITLE_KEY_ART_URL } from '../game/catalog';
import type { CovenantId } from '../game/types';

interface TitleScreenProps {
  selectedCovenant: CovenantId;
  authUser: User | null;
  authBusy: boolean;
  authError: string | null;
  onSelectCovenant: (covenant: CovenantId) => void;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onStart: () => void;
}

const COVENANT_ORDER: CovenantId[] = ['Solari', 'Terra', 'Aether', 'Umbri'];

export function TitleScreen({
  selectedCovenant,
  authUser,
  authBusy,
  authError,
  onSelectCovenant,
  onGoogleSignIn,
  onSignOut,
  onStart,
}: TitleScreenProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        onStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]);

  const activeMeta = COVENANT_META[selectedCovenant];

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#070E0B] text-[#E9EFEA] flex flex-col justify-between">
      {/* Full-bleed illustrated mystical forest key art */}
      <div className="absolute inset-0">
        <img
          src={TITLE_KEY_ART_URL}
          alt="Twilight woodland shrine surrounded by ancient oaks and glowing Glimmer crystals"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-center"
        />
        {/* Measured left-third negative space scrim for crisp typography legibility */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(95deg, rgba(7,14,11,0.94) 0%, rgba(7,14,11,0.82) 38%, rgba(7,14,11,0.28) 72%, rgba(7,14,11,0.45) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(7,14,11,0.35) 0%, rgba(7,14,11,0) 40%, rgba(7,14,11,0.88) 100%)',
          }}
        />
      </div>

      {/* Main focal lockup in calm left negative space */}
      <div className="relative z-10 flex-1 flex items-center px-6 sm:px-12 lg:px-20 py-14">
        <div className="max-w-xl w-full space-y-8">
          {/* Bespoke inline SVG GlimmerFall Shattered Crystal Crest + Display Wordmark */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <svg
                viewBox="0 0 64 64"
                className="w-14 h-14 shrink-0"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="gfCrystal" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F5C75E" />
                    <stop offset="55%" stopColor="#E6A832" />
                    <stop offset="100%" stopColor="#2BB673" />
                  </linearGradient>
                </defs>
                <polygon
                  points="32,4 52,22 44,58 20,58 12,22"
                  fill="#0B1612"
                  stroke="url(#gfCrystal)"
                  strokeWidth="2.5"
                />
                <polygon points="32,10 44,24 32,49 20,24" fill="url(#gfCrystal)" opacity="0.92" />
                <line x1="32" y1="10" x2="32" y2="49" stroke="#09110E" strokeWidth="1.5" />
                <line x1="20" y1="24" x2="44" y2="24" stroke="#FFF6D6" strokeWidth="1" opacity="0.7" />
              </svg>
              <div>
                <h1
                  className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-wide text-[#F7F3E8]"
                  style={{ textShadow: '0 2px 18px rgba(0,0,0,0.75)' }}
                >
                  GLIMMERFALL
                </h1>
                <p className="text-sm sm:text-base tracking-[0.22em] text-[#D7C397] font-medium mt-1">
                  IDLE REALM OF LIGHT &amp; VOID
                </p>
              </div>
            </div>

            <p className="text-base text-[#C6D4CB] leading-relaxed max-w-md">
              Channel ancient Glimmer Nodes, awaken Covenant entities from the shattered Nexus, complete daily quests, and clash in global ranked duels.
            </p>
          </div>

          {/* Covenant selection controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#9DB1A5]">
              <span>Choose Your Covenant</span>
              <span className="text-[#E6D3A3]">{activeMeta.domain}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COVENANT_ORDER.map((cov) => {
                const meta = COVENANT_META[cov];
                const isSelected = cov === selectedCovenant;
                return (
                  <button
                    key={cov}
                    type="button"
                    onClick={() => onSelectCovenant(cov)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-semibold border transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E6A832] ${
                      isSelected
                        ? 'bg-[#172821] text-[#FFF9EB] border-[#E6A832]'
                        : 'bg-[#0C1612]/90 text-[#A7B9AE] border-[#22352D] hover:border-[#3D5E50] hover:text-[#E9EFEA]'
                    }`}
                  >
                    {cov}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-[#9DB1A5] leading-relaxed">{activeMeta.summary}</p>
          </div>

          {/* Primary Start & Firebase Google Login / Registration CTAs */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onStart();
                }}
                className="px-8 py-3.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] active:scale-[0.99] text-[#09110E] font-bold text-base tracking-wide transition-all shadow-lg shadow-black/40 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFF3C4]"
              >
                {authUser ? 'Enter the Glade' : 'Play as Guest'}
              </button>

              {authUser ? (
                <div className="inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#0E1A15]/95 border border-[#2A4539] text-xs text-[#DCE6DF]">
                  <span className="truncate max-w-[190px]">
                    {authUser.displayName || authUser.email}
                  </span>
                  <button
                    type="button"
                    onClick={onSignOut}
                    disabled={authBusy}
                    aria-label="Sign out of Google account"
                    className="inline-flex items-center gap-1 text-[#9AB0A3] hover:text-white transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="google-signin-button"
                  onClick={onGoogleSignIn}
                  disabled={authBusy}
                  className="inline-flex items-center gap-2.5 px-5 py-3.5 rounded-lg bg-[#11201A]/95 hover:bg-[#192F26] border border-[#314F42] text-[#F5F1E6] font-semibold text-sm transition-colors whitespace-nowrap"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.6 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"
                    />
                  </svg>
                  {authBusy ? 'Connecting Google…' : 'Sign in / Register with Google'}
                </button>
              )}
            </div>

            {authError && (
              <p className="text-xs text-[#F4A6A6]" role="alert">
                {authError}
              </p>
            )}

            <div className="text-xs text-[#A3B5AA]">
              glimmerfall.online · glimmerfalltcg.com · manga.glimmerfall.online
            </div>
          </div>
        </div>
      </div>

      {/* Single flat non-interactive control hint in bottom safe margin */}
      <div className="relative z-10 px-6 sm:px-12 lg:px-20 pb-6 text-xs text-[#8FA497]">
        Press Enter or Space to Enter · Tap Glimmer Nodes to Harvest · Esc to Pause
      </div>
    </main>
  );
}
