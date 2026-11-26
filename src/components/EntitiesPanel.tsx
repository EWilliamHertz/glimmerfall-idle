import { useState } from 'react';
import {
  ARTISAN_PROFESSIONS,
  COVENANT_META,
  ENTITY_CATALOG,
  NFT_SKIN_CATALOG,
  TCG_CARDS,
} from '../game/catalog';
import {
  formatCompactNumber,
  getEntityUpgradeCost,
  getProfessionUpgradeCost,
} from '../game/engine';
import type { PlayerState } from '../game/types';

interface EntitiesPanelProps {
  player: PlayerState;
  entityImages: Record<string, string>;
  busyAction: string | null;
  onUpgradeEntity: (entityId: string) => void;
  onSetActiveEntity: (entityId: string) => void;
  onUpgradeProfession: (professionId: string) => void;
  onToggleTcgCard: (cardId: string) => void;
}

export function EntitiesPanel({
  player,
  entityImages,
  busyAction,
  onUpgradeEntity,
  onSetActiveEntity,
  onUpgradeProfession,
  onToggleTcgCard,
}: EntitiesPanelProps) {
  const [subTab, setSubTab] = useState<'entities' | 'tcg' | 'professions'>('entities');
  const [fallbackToLocal, setFallbackToLocal] = useState<Record<string, boolean>>({});
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-[#F5F1E6]">
            Covenant Entities &amp; TCG Resonance
          </h2>
          <p className="text-sm text-[#9AB0A3] mt-0.5">
            Level raw entities from glimmerfall.online and slot glimmerfalltcg.com cards into your Resonance Row.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Entity progression sections"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0F1A15] border border-[#20332B] self-start"
        >
          {(
            [
              ['entities', 'Entities'],
              ['tcg', `Resonance Row (${player.equippedResonanceRow.length}/3)`],
              ['professions', 'Artisan Crafts'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              onClick={() => setSubTab(id)}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subTab === id
                  ? 'bg-[#1D3028] text-[#FFF7E2]'
                  : 'text-[#8FA497] hover:text-[#E9EFEA]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'entities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ENTITY_CATALOG.map((entity) => {
            const level = player.entityLevels[entity.id] ?? 0;
            const cost = getEntityUpgradeCost(entity.id, level);
            const canAfford = player.resources.glimmerShards >= cost;
            const isActive = player.activeEntityId === entity.id;
            const skinId = player.equippedSkinByEntity[entity.id];
            const equippedSkin = NFT_SKIN_CATALOG.find((s) => s.id === skinId);
            const covMeta = COVENANT_META[entity.covenant];
            const remoteUrl = entityImages[entity.id];
            const resolvedSrc =
              remoteUrl && !fallbackToLocal[entity.id] ? remoteUrl : entity.portraitUrl;
            const imgBroken = failedImages[entity.id];

            return (
              <article
                key={entity.id}
                className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl bg-[#101B17] border border-[#20342C]"
              >
                <div className="relative w-full sm:w-28 h-36 sm:h-28 rounded-lg overflow-hidden shrink-0 bg-[#0A1310] border border-[#273E34]">
                  {!imgBroken ? (
                    <img
                      src={resolvedSrc}
                      alt={`${entity.name} raw entity artwork`}
                      referrerPolicy="no-referrer"
                      style={equippedSkin ? { filter: equippedSkin.portraitFilter } : undefined}
                      onError={() => {
                        if (remoteUrl && !fallbackToLocal[entity.id]) {
                          setFallbackToLocal((prev) => ({ ...prev, [entity.id]: true }));
                        } else {
                          setFailedImages((prev) => ({ ...prev, [entity.id]: true }));
                        }
                      }}
                      className="w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-display text-[#C7D5CC] p-2 text-center">
                      {entity.name}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-lg font-bold text-[#F5F1E6] truncate">
                        {entity.name}
                      </h3>
                      <span className="font-mono text-sm font-semibold tabular-nums text-[#E6A832] shrink-0">
                        Lv. {level}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#91A79A] mt-0.5">
                      <span style={{ color: covMeta.accentHex }} className="font-medium">
                        {entity.covenant}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{entity.role}</span>
                      <span aria-hidden="true">·</span>
                      <span>{entity.sourceRef}</span>
                    </div>

                    <p className="text-xs text-[#A5B7AC] mt-2 leading-relaxed">{entity.lore}</p>

                    {equippedSkin && (
                      <p className="text-xs text-[#E6C573] mt-1.5 font-medium">
                        NFT Skin Active: {equippedSkin.name} (+{Math.round(equippedSkin.productionBonus * 100)}% Yield)
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1C2D26]">
                    <div className="text-xs font-mono tabular-nums text-[#B4C6BC]">
                      +{entity.baseResonancePerSec}/s · +{entity.baseCombatPower} Power
                    </div>

                    <div className="flex items-center gap-2">
                      {level > 0 && !isActive && (
                        <button
                          type="button"
                          onClick={() => onSetActiveEntity(entity.id)}
                          disabled={busyAction !== null}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-[#C6D4CB] border border-[#2B4339] hover:border-[#496D5E] hover:text-white transition-colors whitespace-nowrap"
                        >
                          Deploy
                        </button>
                      )}
                      {isActive && (
                        <span className="text-xs font-semibold text-[#5CE0A4] px-1">Active</span>
                      )}
                      <button
                        type="button"
                        onClick={() => onUpgradeEntity(entity.id)}
                        disabled={!canAfford || busyAction !== null}
                        aria-label={`${level === 0 ? 'Summon' : 'Upgrade'} ${entity.name} for ${cost} Glimmer Shards`}
                        className={`px-4 py-2 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors whitespace-nowrap ${
                          canAfford
                            ? 'bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E]'
                            : 'bg-[#192822] text-[#6A7F73] cursor-not-allowed'
                        }`}
                      >
                        {level === 0 ? 'Summon' : 'Upgrade'} · {formatCompactNumber(cost)}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {subTab === 'tcg' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#0F1B16] border border-[#20342C] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#F5F1E6]">
                Active TCG Resonance Row ({player.equippedResonanceRow.length} / 3 Slots)
              </h3>
              <p className="text-xs text-[#9AB0A3] mt-0.5">
                Unlock official glimmerfalltcg.com Entities, Rites &amp; Relics with Verdant Essence ({Math.floor(player.resources.verdantEssence)} available).
              </p>
            </div>
            <div className="text-xs font-mono tabular-nums text-[#5CE0A4]">
              {player.equippedResonanceRow.length > 0
                ? player.equippedResonanceRow
                    .map((id) => TCG_CARDS.find((c) => c.id === id)?.name ?? id)
                    .join(' · ')
                : 'No cards slotted'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TCG_CARDS.map((card) => {
              const unlocked = player.unlockedTcgCardIds.includes(card.id);
              const equipped = player.equippedResonanceRow.includes(card.id);
              const canAfford = player.resources.verdantEssence >= card.unlockCostEssence;
              const covMeta = COVENANT_META[card.covenant];

              return (
                <article
                  key={card.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-4 ${
                    equipped
                      ? 'bg-[#15251F] border-[#E6A832]'
                      : 'bg-[#101B17] border-[#20342C]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span style={{ color: covMeta.accentHex }} className="font-semibold">
                        {card.covenant} · {card.cardType}
                      </span>
                      <span className="text-[#9AB0A3] font-mono">{card.keyword}</span>
                    </div>
                    <h4 className="font-display text-lg font-bold text-[#F5F1E6] mt-1">
                      {card.name}
                    </h4>
                    <p className="text-xs text-[#A5B7AC] mt-2 leading-relaxed">
                      {card.effectSummary}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#1D2F28]">
                    <span className="text-xs font-mono tabular-nums text-[#C4D3CA]">
                      +{Math.round(card.idleMultiplierBonus * 100)}% Idle · +{card.pvpPowerBonus} PvP
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleTcgCard(card.id)}
                      disabled={(!unlocked && !canAfford) || busyAction !== null}
                      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                        equipped
                          ? 'bg-[#22392F] text-[#E9EFEA] hover:bg-[#2C4A3D]'
                          : unlocked
                            ? 'bg-[#E6A832] text-[#09110E] hover:bg-[#F2B844]'
                            : canAfford
                              ? 'bg-[#2BB673] text-[#07130D] hover:bg-[#38C982]'
                              : 'bg-[#192822] text-[#6A7F73] cursor-not-allowed'
                      }`}
                    >
                      {equipped
                        ? 'Unslot'
                        : unlocked
                          ? 'Slot Card'
                          : `Unlock · ${card.unlockCostEssence} Ess.`}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'professions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ARTISAN_PROFESSIONS.map((prof) => {
            const level = player.professionLevels[prof.id] ?? 0;
            const cost = getProfessionUpgradeCost(prof.id, level);
            const canAfford = player.resources.glimmerShards >= cost && level < prof.maxLevel;

            return (
              <article
                key={prof.id}
                className="p-4 rounded-xl bg-[#101B17] border border-[#20342C] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-[#F5F1E6]">{prof.name}</h3>
                    <span className="font-mono text-sm tabular-nums text-[#5CE0A4]">
                      Lv. {level} / {prof.maxLevel}
                    </span>
                  </div>
                  <p className="text-xs text-[#A5B7AC] mt-1.5 leading-relaxed">{prof.description}</p>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#1C2D26]">
                  <span className="text-xs font-mono tabular-nums text-[#B4C6BC]">
                    Current Bonus: +{Math.round(level * prof.bonusPerLevel * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpgradeProfession(prof.id)}
                    disabled={!canAfford || busyAction !== null}
                    className={`px-4 py-2 rounded-lg text-xs font-bold font-mono tabular-nums transition-colors whitespace-nowrap ${
                      canAfford
                        ? 'bg-[#E6A832] hover:bg-[#F2B844] text-[#09110E]'
                        : 'bg-[#192822] text-[#6A7F73] cursor-not-allowed'
                    }`}
                  >
                    {level >= prof.maxLevel ? 'Mastered' : `Train · ${formatCompactNumber(cost)}`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
