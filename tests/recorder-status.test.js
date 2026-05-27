// Recorder.toReplay().status — human-readable match-end summary used by the
// auto-battles harness. The string is computed from result.winner + the AI
// types in effect; markTimeout() forces "timeout" regardless of winner.

import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/core/config.js';
import { createSimWorld, spawnInitial, stepTick, TICK_DT } from '../src/sim/index.js';

function freshSim() {
  const sim = createSimWorld(CONFIG);
  spawnInitial(sim);
  return sim;
}

describe('recorder.toReplay().status', () => {
  it('returns null while the match is in progress', () => {
    const sim = freshSim();
    stepTick(sim, TICK_DT);
    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.result.winner).toBe(null);
    expect(replay.status).toBe(null);
  });

  it('summarizes a red victory using AI labels', () => {
    const sim = freshSim();
    sim.state.aiType.red  = 'att';
    sim.state.aiType.blue = 'hybrid';
    sim.state.gameOver = 'red';
    sim.recorder.finish(sim.state);

    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.result.winner).toBe('red');
    expect(replay.status).toBe('Red(Att AI) > Blue(Hybrid AI)');
  });

  it('summarizes a blue victory with Red/Blue swapped', () => {
    const sim = freshSim();
    sim.state.aiType.red  = 'utility';
    sim.state.aiType.blue = 'adaptive';
    sim.state.gameOver = 'blue';
    sim.recorder.finish(sim.state);

    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.status).toBe('Blue(Adaptive AI) > Red(Utility AI)');
  });

  it('reports "draw" when both sides are eliminated', () => {
    const sim = freshSim();
    sim.state.gameOver = 'draw';
    sim.recorder.finish(sim.state);

    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.status).toBe('draw');
  });

  it('reports "timeout" when markTimeout() was called before finish()', () => {
    const sim = freshSim();
    sim.state.aiType.red  = 'att';
    sim.state.aiType.blue = 'hybrid';
    // Harness path: timeout fires, mark + finish with state.gameOver still null.
    sim.recorder.markTimeout();
    sim.recorder.finish(sim.state);

    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.result.winner).toBe(null);
    expect(replay.status).toBe('timeout');
  });

  it('markTimeout() after a natural finish is a no-op (winner wins the race)', () => {
    const sim = freshSim();
    sim.state.aiType.red  = 'att';
    sim.state.aiType.blue = 'adaptive';
    sim.state.gameOver = 'red';
    sim.recorder.finish(sim.state);   // natural finish first
    sim.recorder.markTimeout();        // late timeout — must not overwrite

    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.status).toBe('Red(Att AI) > Blue(Adaptive AI)');
  });

  it('begin() clears a stale timeout flag from a previous match', () => {
    const sim = freshSim();
    sim.recorder.markTimeout();
    sim.recorder.finish(sim.state);
    expect(sim.recorder.toReplay(sim.state).status).toBe('timeout');

    // Fresh match: begin() is invoked via spawnInitial under the hood.
    spawnInitial(sim);
    const replay = sim.recorder.toReplay(sim.state);
    expect(replay.status).toBe(null);
  });
});
