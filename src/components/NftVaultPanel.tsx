import { useState } from 'react';
import { BookOpen, Link2, ShieldCheck } from 'lucide-react';
import {
  COVENANT_META,
  ENTITY_CATALOG,
  GLIMMERFALL_CONTRACT_ADDRESS,
  MANGA_CHAPTERS,
  NFT_SKIN_CATALOG,
} from '../game/catalog';
import { sha256Hex } from '../game/chain';
import { formatCompactNumber, getUnlockedMangaChapters } from '../game/engine';
import type { PlayerState } from '../game/types';

interface NftVaultPanelProps {
  player: PlayerState;
  entityImages: Record<string, string>;
  busyAction: string | null;
  onConnectWallet: () => void;
  onMintSkin: (skinId: string) => void;
  onEquipSkin: (skinId: string) => void;
}

export function NftVaultPanel({
  player,
  entityImages,
  busyAction,
  onConnectWallet,
  onMintSkin,
  onEquipSkin,
}: NftVaultPanelProps) {
  const [selectedChapterId, setSelectedChapterId] = useState<string>(MANGA_CHAPTERS[0].id);
  const [fallbackToLocal, setFallbackToLocal] = useState<Record<string, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const unlockedChapters = getUnlockedMangaChapters(player.resources.totalGlimmerEarned);
  const activeChapter = MANGA_CHAPTERS.find((c) => c.id === selectedChapterId) ?? MANGA_CHAPTERS[0];
  const isChapterUnlocked = unlockedChapters.some((c) => c.id === activeChapter.id);

  return (
    <section className="space-y-8">
      {/* Wallet & ERC-721 Contract Header */}
      <div className="p-5 rounded-xl bg-[#101B17] border border-[#20342C] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-bold text-[#F5F1E6]">
            NFT Entity Skin Vault &amp; Inventory
          </h2>
          <p className="text-sm text-[#9AB0A3]">
            ERC-721 skins linked to GlimmerChain provenance · Contract{' '}
            <span className="font-mono text-xs text-[#C9D8CF]">
              {GLIMMERFALL_CONTRACT_ADDRESS.slice(0, 12)}…{GLIMMERFALL_CONTRACT_ADDRESS.slice(-6)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {player.walletAddress ? (
            <div className="flex items-center gap-2 text-xs font-mono text-[#5CE0A4] bg-[#0B1511] border border-[#234034] px-3.5 py-2.5 rounded-lg">
              <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {player.walletAddress.slice(0, 8)}…{player.walletAddress.slice(-6)}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onConnectWallet}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E] text-xs font-bold transition-colors whitespace-nowrap"
            >
              <Link2 className="w-4 h-4" aria-hidden="true" />
              Connect Web3 Wallet
            </button>
          )}
        </div>
      </div>

      {/* Inventory Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Glimmer Shards', value: formatCompactNumber(player.resources.glimmerShards) },
          { label: 'Verdant Essence', value: formatCompactNumber(player.resources.verdantEssence) },
          { label: 'Void Motes', value: formatCompactNumber(player.resources.voidMotes) },
          { label: 'Owned NFT Skins', value: `${player.ownedSkinIds.length} / ${NFT_SKIN_CATALOG.length}` },
        ].map((item) => (
          <div
            key={item.label}
            className="p-3.5 rounded-xl bg-[#0D1713] border border-[#1E3129]"
          >
            <div className="text-xs text-[#8DA396]">{item.label}</div>
            <div className="font-mono text-xl font-semibold tabular-nums text-[#F5F1E6] mt-1">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* NFT Skin Gallery */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {NFT_SKIN_CATALOG.map((skin) => {
          const entity = ENTITY_CATALOG.find((e) => e.id === skin.entityId) ?? ENTITY_CATALOG[0];
          const owned = player.ownedSkinIds.includes(skin.id);
          const equipped = player.equippedSkinByEntity[skin.entityId] === skin.id;
          const canAfford =
            player.resources.glimmerShards >= skin.mintCostShards &&
            player.resources.voidMotes >= skin.mintCostVoidMotes;
          const covMeta = COVENANT_META[skin.covenant];
          const provenanceHash = sha256Hex(`${skin.contractAddress}|${skin.tokenId}|${player.playerId}`).slice(0, 14);
          const remoteUrl = entityImages[entity.id];
          const resolvedSrc =
            remoteUrl && !fallbackToLocal[skin.id] ? remoteUrl : entity.portraitUrl;
          const imgBroken = failedImages[skin.id];

          return (
            <article
              key={skin.id}
              className={`rounded-xl overflow-hidden border flex flex-col justify-between ${
                equipped
                  ? 'bg-[#14231D] border-[#E6A832]'
                  : 'bg-[#101B17] border-[#20342C]'
              }`}
            >
              <div>
                <div className="relative h-44 bg-[#09120F] overflow-hidden">
                  {!imgBroken ? (
                    <img
                      src={resolvedSrc}
                      alt={`${skin.name} NFT entity skin artwork`}
                      referrerPolicy="no-referrer"
                      style={{ filter: skin.portraitFilter }}
                      onError={() => {
                        if (remoteUrl && !fallbackToLocal[skin.id]) {
                          setFallbackToLocal((prev) => ({ ...prev, [skin.id]: true }));
                        } else {
                          setFailedImages((prev) => ({ ...prev, [skin.id]: true }));
                        }
                      }}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-display text-sm text-[#C7D5CC]">
                      {skin.name}
                    </div>
                  )}
                  <div
                    className="absolute inset-x-0 bottom-0 h-20"
                    style={{
                      background: 'linear-gradient(180deg, rgba(16,27,23,0) 0%, rgba(16,27,23,0.96) 100%)',
                    }}
                  />
                  <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-xs font-mono">
                    <span style={{ color: skin.auraHex }} className="font-semibold">
                      {skin.tokenId}
                    </span>
                    <span className="text-[#D4DFD8]">{skin.rarity}</span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs text-[#91A79A]">
                    <span style={{ color: covMeta.accentHex }} className="font-medium">
                      {skin.covenant}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{entity.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{skin.editionSource}</span>
                  </div>

                  <h3 className="font-display text-lg font-bold text-[#F5F1E6]">{skin.name}</h3>
                  <p className="text-xs text-[#A5B7AC] leading-relaxed">{skin.description}</p>

                  <div className="text-xs font-mono tabular-nums text-[#8FA497] pt-1">
                    Provenance: 0x{provenanceHash}… · +{Math.round(skin.productionBonus * 100)}% Yield · +{skin.pvpBonus} PvP
                  </div>
                </div>
              </div>

              <div className="px-4 pb-4 pt-2 border-t border-[#1C2E27] flex items-center justify-between gap-2">
                <span className="text-xs font-mono tabular-nums text-[#C4D3CA]">
                  {owned
                    ? equipped
                      ? 'Equipped on Entity'
                      : 'Stored in Vault'
                    : `${formatCompactNumber(skin.mintCostShards)} Shards${
                        skin.mintCostVoidMotes > 0 ? ` · ${skin.mintCostVoidMotes} Void` : ''
                      }`}
                </span>
                {owned ? (
                  <button
                    type="button"
                    onClick={() => onEquipSkin(skin.id)}
                    disabled={equipped || busyAction !== null}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      equipped
                        ? 'bg-[#1D3229] text-[#5CE0A4] cursor-default'
                        : 'bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E]'
                    }`}
                  >
                    {equipped ? 'Equipped' : 'Equip Skin'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onMintSkin(skin.id)}
                    disabled={!canAfford || busyAction !== null}
                    aria-label={`Mint ${skin.name} NFT skin`}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                      canAfford
                        ? 'bg-[#2BB673] hover:bg-[#38C982] text-[#07130D]'
                        : 'bg-[#192822] text-[#6A7F73] cursor-not-allowed'
                    }`}
                  >
                    Mint NFT
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* GlimmerFall Manga Chronicles Codex (manga.glimmerfall.online) */}
      <div className="p-5 rounded-xl bg-[#101B17] border border-[#20342C] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-[#E6A832]" aria-hidden="true" />
            <div>
              <h3 className="font-display text-xl font-bold text-[#F5F1E6]">
                GlimmerFall Manga Chronicles
              </h3>
              <p className="text-xs text-[#9AB0A3]">
                manga.glimmerfall.online lore chapters unlocked via total Glimmer harvested ({unlockedChapters.length}/{MANGA_CHAPTERS.length} unlocked)
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#5CE0A4]">
            Active Manga Bonus: +
            {unlockedChapters.reduce((sum, ch) => sum + ch.passiveBonusPct, 0)}% Resonance
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2">
            {MANGA_CHAPTERS.map((ch) => {
              const unlocked = player.resources.totalGlimmerEarned >= ch.unlockTotalGlimmer;
              const selected = ch.id === activeChapter.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedChapterId(ch.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors ${
                    selected
                      ? 'bg-[#182922] border-[#E6A832] text-[#FFF7E2]'
                      : 'bg-[#0C1511] border-[#1E3129] text-[#A4B6AB] hover:border-[#345446]'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span>Ch. {ch.chapterNumber}</span>
                    <span className={unlocked ? 'text-[#5CE0A4]' : 'text-[#778B7F]'}>
                      {unlocked ? `+${ch.passiveBonusPct}%` : `${formatCompactNumber(ch.unlockTotalGlimmer)} Shards`}
                    </span>
                  </div>
                  <div className="text-sm font-semibold mt-0.5 truncate">{ch.title}</div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2 p-5 rounded-xl bg-[#0B1410] border border-[#1E3129] flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="text-xs text-[#8FA497]">
                {activeChapter.arc} · {activeChapter.urlRef}
              </div>
              <h4 className="font-display text-xl font-bold text-[#F5F1E6]">
                Chapter {activeChapter.chapterNumber}: {activeChapter.title}
              </h4>
              {isChapterUnlocked ? (
                <p className="text-sm text-[#CAD7CE] leading-relaxed max-w-prose">
                  {activeChapter.excerpt}
                </p>
              ) : (
                <p className="text-sm text-[#859A8E] leading-relaxed">
                  Reach {formatCompactNumber(activeChapter.unlockTotalGlimmer)} lifetime Glimmer Shards to unlock this chronicle chapter and claim its permanent +{activeChapter.passiveBonusPct}% Resonance multiplier.
                </p>
              )}
            </div>
            <div className="text-xs font-mono tabular-nums text-[#E6A832]">
              {isChapterUnlocked
                ? `Chapter Active · Permanent +${activeChapter.passiveBonusPct}% Idle Resonance`
                : `Progress: ${formatCompactNumber(player.resources.totalGlimmerEarned)} / ${formatCompactNumber(activeChapter.unlockTotalGlimmer)} Glimmer`}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
