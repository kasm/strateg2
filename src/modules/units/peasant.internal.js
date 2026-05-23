// Internal: per-tick update for the peasant unit kind.

import { moveAlongPath } from './movement.internal.js';
import {
  tryAutoLogistics,
  doGather, doHaulWood, doHaulArrows, doAttack,
} from './logistics.internal.js';

export function updatePeasant(u, dt, deps) {
  if (!u.job && u.state === 'idle') tryAutoLogistics(u, deps);

  switch (u.job) {
    case 'gather':      doGather(u, dt, deps);     break;
    case 'haulWood':    doHaulWood(u, dt, deps);   break;
    case 'haulArrows':  doHaulArrows(u, dt, deps); break;
    case 'attack':      doAttack(u, dt, deps);     break;
    default:            moveAlongPath(u, dt, deps);
  }
}
