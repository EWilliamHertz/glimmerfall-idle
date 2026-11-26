import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyIdleTick,
  applyManualHarvest,
  calculateProduction,
  claimDailyQuest,
  createInitialPlayerState,
  equipNftSkin,
  getEntityUpgradeCost,
  mintNftSkin,
  resolveNexusDuelTurn,
  toggleTcgCardSlot,
  unlockOrSelectZone,
  upgradeEntity,
} from './engine';
import { createStateBlock, verifyChainIntegrity } from './chain';
import type { NexusMatch } from './types';

test('idle progression and manual harvest increase shards and total earned accurately', () => {
  const initial = createInitialPlayerState('player_test_01', 'Aelindra', 'Solari');
  const prod = calculateProduction(initial);
  assert.ok(prod.resonancePerSec >= 2);
  assert.ok(prod.clickYield >= 2);

  const afterTick = applyIdleTick(initial, 10);
  assert.ok(afterTick.resources.glimmerShards > initial.resources.glimmerShards);
  assert.equal(
    Math.round(afterTick.resources.totalGlimmerEarned - initial.resources.totalGlimmerEarned),
    Math.round(prod.resonancePerSec * 10),
  );

  const harvest = applyManualHarvest(afterTick, 3);
  assert.equal(harvest.gainedShards, prod.clickYield * 3);
  assert.equal(harvest.state.totalClicks, 3);
  assert.equal(harvest.state.dailyQuests.tapsCompleted, 3);
});

test('entity upgrades enforce Glimmer Shard cost and raise Resonance/sec', () => {
  const state = createInitialPlayerState('player_test_02', 'Kael', 'Terra');
  const cost = getEntityUpgradeCost('solari_vanguard', 1);
  state.resources.glimmerShards = cost - 1;

  const failRes = upgradeEntity(state, 'solari_vanguard');
  assert.equal(failRes.ok, false);

  const beforeProd = calculateProduction(state).resonancePerSec;
  state.resources.glimmerShards = cost + 5;
  const okRes = upgradeEntity(state, 'solari_vanguard');
  assert.equal(okRes.ok, true);
  assert.equal(okRes.state.entityLevels.solari_vanguard, 2);
  assert.equal(okRes.state.resources.glimmerShards, 5);
  assert.equal(okRes.state.dailyQuests.upgradesCompleted, 1);
  assert.ok(calculateProduction(okRes.state).resonancePerSec > beforeProd);
});

test('NFT skin minting and TCG Resonance Row multipliers boost production and combat power', () => {
  const state = createInitialPlayerState('player_test_03', 'Mira', 'Solari');
  state.resources.glimmerShards = 500;
  state.resources.verdantEssence = 100;

  const baseProd = calculateProduction(state);
  const minted = mintNftSkin(state, 'skin_solari_dawnplate');
  assert.equal(minted.ok, true);
  assert.ok(minted.state.ownedSkinIds.includes('skin_solari_dawnplate'));

  const equipped = equipNftSkin(minted.state, 'skin_solari_dawnplate');
  assert.equal(equipped.ok, true);

  const withCard = toggleTcgCardSlot(equipped.state, 'moss_drake_totem');
  assert.equal(withCard.ok, true);
  assert.ok(withCard.state.equippedResonanceRow.includes('moss_drake_totem'));

  const boostedProd = calculateProduction(withCard.state);
  assert.ok(boostedProd.resonancePerSec > baseProd.resonancePerSec);
  assert.ok(boostedProd.combatPower > baseProd.combatPower);
});

test('forest zone unlock requires Glimmer Shards and multiplies harvest yield', () => {
  const state = createInitialPlayerState('player_test_04', 'Dusk', 'Solari');
  const blocked = unlockOrSelectZone(state, 'duskwood_glade');
  assert.equal(blocked.ok, false);

  state.resources.glimmerShards = 400;
  const unlocked = unlockOrSelectZone(state, 'duskwood_glade');
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.state.activeZoneId, 'duskwood_glade');
  assert.ok(calculateProduction(unlocked.state).zoneMultiplier > 1.5);
});

test('Nexus PvP 3-turn duel resolves combat, counters, and Elo rewards cleanly', () => {
  let match: NexusMatch = {
    matchId: 'match_unit_01',
    playerId: 'player_test_05',
    playerName: 'Aelindra',
    playerCovenant: 'Solari',
    playerPower: 180,
    playerHp: 220,
    playerMaxHp: 220,
    opponentId: 'rival_vesper',
    opponentName: 'Vesper Voidwalker',
    opponentCovenant: 'Umbri',
    opponentElo: 1120,
    opponentPower: 150,
    opponentHp: 200,
    opponentMaxHp: 200,
    opponentRegion: 'EU-Central',
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

  match = resolveNexusDuelTurn(match, 'solari_strike', 'umbri_drain');
  assert.equal(match.turnLogs.length, 1);
  assert.ok(match.turnLogs[0].note.includes('Counter!'));

  while (match.status === 'active') {
    match = resolveNexusDuelTurn(match, 'solari_strike', 'umbri_drain');
  }

  assert.equal(match.status, 'victory');
  assert.ok(match.eloDelta > 0);
  assert.ok(match.rewardShards > 0);
});

test('blockchain state ledger verifies valid hash chain and detects tampering', () => {
  const s1 = createInitialPlayerState('player_chain_01', 'ChainGuard', 'Aether');
  const b1 = createStateBlock(s1, null, 'Genesis Commitment', 1700000000000);

  const s2 = applyManualHarvest(s1, 5).state;
  const b2 = createStateBlock(s2, b1, 'Harvest Checkpoint', 1700000005000);

  const okCheck = verifyChainIntegrity([b1, b2]);
  assert.equal(okCheck.valid, true);
  assert.equal(okCheck.checkedBlocks, 2);

  // Tamper with b1 stateRoot
  const tamperedB1 = { ...b1, stateRoot: 'f'.repeat(64) };
  const badCheck = verifyChainIntegrity([tamperedB1, b2]);
  assert.equal(badCheck.valid, false);
  assert.equal(badCheck.brokenAtHeight, 1);
});

test('daily quests enforce targets, payout rewards once, and advance streak on full completion', () => {
  const dateKey = '2026-11-26';
  let state = createInitialPlayerState('player_dq_01', 'QuestWarden', 'Solari');
  state.dailyQuests.dateKey = dateKey;

  const earlyClaim = claimDailyQuest(state, 'dq_channel_nodes', dateKey);
  assert.equal(earlyClaim.ok, false);

  state = applyManualHarvest(state, 15).state;
  const shardsBefore = state.resources.glimmerShards;
  const claimed1 = claimDailyQuest(state, 'dq_channel_nodes', dateKey);
  assert.equal(claimed1.ok, true);
  assert.ok(claimed1.state.resources.glimmerShards > shardsBefore);
  assert.ok(claimed1.state.dailyQuests.claimedQuestIds.includes('dq_channel_nodes'));

  const duplicate = claimDailyQuest(claimed1.state, 'dq_channel_nodes', dateKey);
  assert.equal(duplicate.ok, false);

  // Complete remaining 3 quests and confirm streak increments
  let readyAll = {
    ...claimed1.state,
    dailyQuests: {
      ...claimed1.state.dailyQuests,
      upgradesCompleted: 3,
      duelsCompleted: 1,
      blocksAnchored: 1,
    },
  };
  readyAll = claimDailyQuest(readyAll, 'dq_upgrade_entity', dateKey).state;
  readyAll = claimDailyQuest(readyAll, 'dq_nexus_duel', dateKey).state;
  const finalClaim = claimDailyQuest(readyAll, 'dq_anchor_block', dateKey);
  assert.equal(finalClaim.ok, true);
  assert.equal(finalClaim.state.dailyQuests.status, 'all_claimed');
  assert.equal(finalClaim.state.dailyQuests.streakCount, 1);
});

test('calculateProduction handles undefined or partial player state safely', () => {
  const fallback = calculateProduction(undefined);
  assert.equal(fallback.resonancePerSec, 1);
  assert.equal(fallback.clickYield, 2);
});

