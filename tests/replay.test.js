// Replay recording + reconstruction.
//
// Core invariant under test: the final sim state is a pure function of
// spawnInitial() plus the ordered command stream. If that holds, a recorded
// match reconstructs tick-for-tick — which is the whole basis of the replay
// feature. A failure here is a determinism regression (a stray Math.random(),
// an un-commanded state write, etc.).

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../src/sim/index.js';
import { stateChecksum } from '../src/replay/checksum.js';
import { reconstructReplay } from '../src/replay/reconstruct.js';
import { createPlayback } from '../src/replay/playback.js';

// Play a match with AI on both sides (so builds/trains/orders are generated)
// plus a couple of human setOption commands, recording the whole time.
// Returns the world and a per-tick checksum trail (index 0 = tick 0).
function playRecordedMatch(ticks) {
  const world = createSimWorld(CONFIG);
  spawnInitial(world);
  world.state.aiType.red  = 'att';
  world.state.aiType.blue = 'def';

  const liveChecksums = [stateChecksum(world.state)];
  for (let i = 0; i < ticks; i++) {
    // Sprinkle human commands to exercise the setOption path mid-match.
    if (i === 30) submitCommand(world, { type: 'setOption', playerId: 'red',  key: 'alwaysHit',      value: false });
    if (i === 90) submitCommand(world, { type: 'setOption', playerId: 'blue', key: 'supplyPriority', value: 'wood' });
    stepTick(world, TICK_DT);
    liveChecksums.push(stateChecksum(world.state));
    if (world.state.gameOver) break;
  }
  return { world, liveChecksums };
}

describe('replay: record + reconstruct', () => {
  it('reconstructs a match tick-for-tick from the command log', () => {
    const { world, liveChecksums } = playRecordedMatch(500);
    const replay = world.recorder.toReplay(world.state);

    expect(replay.format).toBe('strateg2-replay');
    expect(replay.commands.length).toBeGreaterThan(0);

    const reconChecksums = [];
    const recon = reconstructReplay(replay, {
      onTick: (_tick, state) => reconChecksums.push(stateChecksum(state)),
    });

    expect(recon.verified).toBe(true);
    expect(reconChecksums).toEqual(liveChecksums);
  });

  it('survives a JSON round-trip', () => {
    const { world } = playRecordedMatch(300);
    const replay = JSON.parse(JSON.stringify(world.recorder.toReplay(world.state)));
    expect(reconstructReplay(replay).verified).toBe(true);
  });

  it('captures setup at tick 0 and records mid-match setOption commands', () => {
    const { world } = playRecordedMatch(200);
    const replay = world.recorder.toReplay(world.state);

    // alwaysHit defaults true at spawn; the tick-30 command flipped it.
    expect(replay.setup.alwaysHit).toBe(true);
    const opts = replay.commands.filter(c => c.type === 'setOption');
    expect(opts.map(c => c.key).sort()).toEqual(['alwaysHit', 'supplyPriority']);
    // The reconstructed final state reflects the flip.
    expect(reconstructReplay(replay).state.alwaysHit).toBe(false);
  });

  it('restart drops the old recording and starts a fresh one', () => {
    const world = createSimWorld(CONFIG);
    spawnInitial(world);
    world.state.aiType.blue = 'att';
    for (let i = 0; i < 120; i++) stepTick(world, TICK_DT);
    expect(world.recorder.commandCount).toBeGreaterThan(0);

    submitCommand(world, { type: 'restart', playerId: 'red' });
    stepTick(world, TICK_DT); // drains the restart -> recorder.begin()
    expect(world.recorder.commandCount).toBe(0);
    expect(world.state.tick).toBe(1); // spawnInitial reset tick, then this tick ran
  });
});

describe('replay: stepwise playback', () => {
  it('reaches finalTick and verifies checksum', () => {
    const { world } = playRecordedMatch(500);
    const replay = world.recorder.toReplay(world.state);

    const playback = createPlayback(replay);
    while (playback.step()) { /* drive to completion */ }

    expect(playback.getTick()).toBe(replay.result.finalTick);
    expect(playback.verifyChecksum()).toBe(true);
  });

  it('produces the same per-tick checksum trail as reconstructReplay', () => {
    const { world } = playRecordedMatch(500);
    const replay = world.recorder.toReplay(world.state);

    const reconTrail = [];
    reconstructReplay(replay, {
      onTick: (_t, state) => reconTrail.push(stateChecksum(state)),
    });

    const playback = createPlayback(replay);
    const playbackTrail = [stateChecksum(playback.state)];
    while (playback.step()) playbackTrail.push(stateChecksum(playback.state));

    expect(playbackTrail).toEqual(reconTrail);
  });

  it('seekForward(target) lands on the recorded mid-match checksum', () => {
    const { world } = playRecordedMatch(500);
    const replay = world.recorder.toReplay(world.state);

    // Build the reference trail once (index N = checksum after N steps from tick 0).
    const reconTrail = [];
    reconstructReplay(replay, {
      onTick: (_t, state) => reconTrail.push(stateChecksum(state)),
    });

    const target = Math.min(150, replay.result.finalTick - 1);
    const playback = createPlayback(replay);
    playback.seekForward(target);

    expect(playback.getTick()).toBe(target);
    expect(stateChecksum(playback.state)).toBe(reconTrail[target]);
    // Forward-only contract.
    expect(() => playback.seekForward(target - 1)).toThrow(/forward-only/);
  });

  it('forces AI off regardless of what was recorded', () => {
    const { world } = playRecordedMatch(200);
    const replay = world.recorder.toReplay(world.state);
    // Sanity: the recorded match ran with AI on (att vs def).
    expect(replay.setup.aiType.red).toBe('att');
    expect(replay.setup.aiType.blue).toBe('def');

    const playback = createPlayback(replay);
    expect(playback.state.aiType.red).toBe('off');
    expect(playback.state.aiType.blue).toBe('off');
  });
});

describe('replay: setOption command', () => {
  it('only setOption may change alwaysHit / supplyPriority in the sim', () => {
    const world = createSimWorld(CONFIG);
    spawnInitial(world);
    world.state.aiType.blue = 'off'; // isolate: no AI commands in the log
    expect(world.state.alwaysHit).toBe(true);

    submitCommand(world, { type: 'setOption', playerId: 'red', key: 'alwaysHit', value: false });
    stepTick(world, TICK_DT);
    expect(world.state.alwaysHit).toBe(false);

    // Invalid values are rejected by validate() and never applied/recorded.
    const before = world.recorder.commandCount;
    submitCommand(world, { type: 'setOption', playerId: 'red', key: 'supplyPriority', value: 'bogus' });
    submitCommand(world, { type: 'setOption', playerId: 'red', key: 'unknownKey',     value: 1 });
    stepTick(world, TICK_DT);
    expect(world.state.supplyPriority).toBe('auto');
    expect(world.recorder.commandCount).toBe(before);
  });
});
