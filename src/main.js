// ENTRY POINT. The whole bootstrap lives in client/bootstrap.js; this file just waits
// for DOM ready and kicks it off. Keeps the index.html script tag stable.

import { startClient } from './client/bootstrap.js';

window.addEventListener('load', startClient);
