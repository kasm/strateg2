// Phase 3 verification: every map preset constructs a runnable world and the
// replay roundtrip preserves the chosen dims (so a replay recorded on a Large
// map reconstructs on a Large map, not the default Medium / legacy 36x20).

import { describe, it, expect } from 'vitest';
import { CONFIG, MAP_PRESETS, DEFAULT_MAP_PRESET } from '../src/core/config.js';
import { createSimWorld, spawnInitial, submitCommand, stepTick, TICK_DT } from '../src/sim/index.js';
import { reconstructReplay } from '../src/replay/reconstruct.js';

describe('map-size presets', () => {
  it('exports a non-empty preset set with a valid default key', () => {
    expect(Object.keys(MAP_PRESETS).length).toBeGreaterThanOrEqual(2);
    expect(MAP_PRESETS[DEFAULT_MAP_PRESET]).toBeTruthy();
  });

  it.each(Object.entries(MAP_PRESETS))('preset %s constructs + spawns + ticks', (_key, preset) => {
    const w = createSimWorld(CONFIG, { mapW: preset.w, mapH: preset.h });
    expect(w.map.w).toBe(preset.w);
    expect(w.map.h).toBe(preset.h);
    spawnInitial(w);
    expect(() => {
      for (let i = 0; i < 30; i++) stepTick(w, TICK_DT);
    }).not.toThrow();
  });

  it('recorder captures mapW / mapH in setup', () => {
    const preset = MAP_PRESETS.large;
    const w = createSimWorld(CONFIG, { mapW: preset.w, mapH: preset.h });
    spawnInitial(w);
    const replay = w.recorder.toReplay(w.state);
    expect(replay.setup.mapW).toBe(preset.w);
    expect(replay.setup.mapH).toBe(preset.h);
  });

  it('replay reconstructs on the original map size, not the default', () => {
    const preset = MAP_PRESETS.large;
    const w = createSimWorld(CONFIG, { mapW: preset.w, mapH: preset.h });
    spawnInitial(w);
    w.state.aiType.red  = 'att';
    w.state.aiType.blue = 'def';
    for (let i = 0; i < 200; i++) {
      if (i === 50) submitCommand(w, { type: 'setOption', playerId: 'red', key: 'alwaysHit', value: false });
      stepTick(w, TICK_DT);
      if (w.state.gameOver) break;
    }
    const replay = JSON.parse(JSON.stringify(w.recorder.toReplay(w.state)));
    const recon  = reconstructReplay(replay);
    expect(recon.world.map.w).toBe(preset.w);
    expect(recon.world.map.h).toBe(preset.h);
    expect(recon.verified).toBe(true);
  });

  it('legacy replay without mapW/mapH falls back to default config dims', () => {
    // Simulate a replay file from before this feature shipped: no mapW/mapH in setup.
    const w = createSimWorld(CONFIG);
    spawnInitial(w);
    for (let i = 0; i < 20; i++) stepTick(w, TICK_DT);
    const replay = w.recorder.toReplay(w.state);
    delete replay.setup.mapW;
    delete replay.setup.mapH;
    const recon = reconstructReplay(replay);
    expect(recon.world.map.w).toBe(CONFIG.mapW);
    expect(recon.world.map.h).toBe(CONFIG.mapH);
    expect(recon.verified).toBe(true);
  });
});
