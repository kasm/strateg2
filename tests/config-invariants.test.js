// Invariant guards for the content seams (resources / research / role dispatch).
// These keep "new content is pure config" honest: a malformed unit/building/research
// def, or a stat read that bypasses the resolver, fails CI instead of shipping.
//
// Strict architectural seam — see memory/feedback_strict_architectural_seams.md.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { CONFIG } from '../src/core/config.js';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const treasuryIds = Object.entries(CONFIG.resourceTypes)
  .filter(([, d]) => d.treasury).map(([id]) => id);

describe('invariant: cost maps reference real resources', () => {
  it('every unit/building/research cost uses only declared resource ids', () => {
    const offenders = [];
    const checkCost = (label, cost) => {
      if (!cost) return;
      for (const id of Object.keys(cost)) {
        if (!treasuryIds.includes(id)) offenders.push(`${label}: unknown resource '${id}'`);
      }
    };
    for (const [k, d] of Object.entries(CONFIG.unit))     checkCost(`unit.${k}`, d.cost);
    for (const [k, d] of Object.entries(CONFIG.building)) checkCost(`building.${k}`, d.cost);
    for (const [k, d] of Object.entries(CONFIG.research)) checkCost(`research.${k}`, d.cost);
    expect(offenders).toEqual([]);
  });

  it('startResources only names treasury resources', () => {
    for (const id of Object.keys(CONFIG.startResources)) {
      expect(treasuryIds).toContain(id);
    }
  });
});

describe('invariant: unit defs declare a dispatchable role', () => {
  it('every unit has role worker|melee|ranged', () => {
    for (const [k, d] of Object.entries(CONFIG.unit)) {
      expect(['worker', 'melee', 'ranged'], `unit.${k}.role`).toContain(d.role);
    }
  });
});

describe('invariant: building references resolve', () => {
  it('every `trains` entry is a real unit kind', () => {
    for (const [k, d] of Object.entries(CONFIG.building)) {
      for (const u of d.trains) expect(CONFIG.unit[u], `building.${k} trains ${u}`).toBeDefined();
    }
  });
  it('every `researches` entry is a real research id hosted here', () => {
    for (const [k, d] of Object.entries(CONFIG.building)) {
      for (const r of d.researches || []) {
        expect(CONFIG.research[r], `building.${k} researches ${r}`).toBeDefined();
        expect(CONFIG.research[r].researchedAt).toBe(k);
      }
    }
  });
});

describe('invariant: research defs are internally consistent', () => {
  it('requires, researchedAt and effect targets all resolve', () => {
    for (const [id, d] of Object.entries(CONFIG.research)) {
      for (const req of d.requires) {
        expect(CONFIG.research[req], `research.${id} requires ${req}`).toBeDefined();
      }
      expect(CONFIG.building[d.researchedAt], `research.${id} researchedAt`).toBeDefined();
      for (const eff of d.effects) {
        if (eff.type === 'stat') {
          expect(CONFIG.unit[eff.kind], `research.${id} stat effect kind`).toBeDefined();
        } else if (eff.type === 'unlock') {
          const table = eff.what === 'building' ? CONFIG.building : CONFIG.unit;
          expect(table[eff.kind], `research.${id} unlock effect kind`).toBeDefined();
        }
      }
    }
  });
});

describe('invariant: combat reads stats through the resolver', () => {
  it('combat/melee.js and combat/ranged.js never read raw config.unit stats', () => {
    // Effective dmg/range/cooldown/speed must flow through core/stats.js unitStat,
    // so research modifiers always apply. Raw config.unit[...].<stat> is the bug.
    const pattern = /config\.unit[^\n;]*\.(dmg|range|cooldown|speed)\b/;
    const offenders = [];
    for (const rel of ['src/modules/combat/melee.js', 'src/modules/combat/ranged.js']) {
      read(rel).split(/\r?\n/).forEach((line, i) => {
        if (pattern.test(line.replace(/\/\/.*$/, ''))) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('invariant: command apply paths spend via economy.js', () => {
  it('commands/*.js never mutate a named resource field directly', () => {
    // Spending must go through canAfford/spend so a new resource is covered for free.
    const pattern = /\.(gold|wood)\s*[-+]?=/;
    const offenders = [];
    const dir = path.join(root, 'src/commands');
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.js')) continue;
      read(`src/commands/${name}`).split(/\r?\n/).forEach((line, i) => {
        if (pattern.test(line.replace(/\/\/.*$/, ''))) offenders.push(`commands/${name}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
