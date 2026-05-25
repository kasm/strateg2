// Client-only lobby UI controller.
// Owns the name-prompt modal, the right-panel player list, the map-size
// selector, and the invite modal. Talks to the server exclusively through the
// NetTransport methods passed in (`setName`, `invite`, `acceptInvite`,
// `declineInvite`). The match-start hello is observed by bootstrap, which
// calls `onMatchStart()` here to hide lobby UI.
//
// Note: this module is loaded only in MP mode. In SP nothing here runs.

/**
 * @param {{
 *   transport: {
 *     setName:        (name:string) => void,
 *     invite:         (toConnId:string, mapW:number, mapH:number) => void,
 *     acceptInvite:   (fromConnId:string, mapW:number, mapH:number) => void,
 *     declineInvite:  (fromConnId:string) => void,
 *   },
 *   presets: Object<string,{label:string,w:number,h:number}>,
 *   defaultPreset: string,
 *   onLoadReplay?: () => void,
 *   onPlayVsAI?:   () => void,
 * }} deps
 */
export function createLobbyUI({ transport, presets, defaultPreset, onLoadReplay, onPlayVsAI }) {
  const namePanel    = document.getElementById('lobby-name-modal');
  const nameInput    = document.getElementById('lobby-name-input');
  const nameSubmit   = document.getElementById('lobby-name-submit');
  const nameError    = document.getElementById('lobby-name-error');
  const playersPanel = document.getElementById('lobby-players-panel');
  const playersList  = document.getElementById('lobby-players');
  const selfLabel    = document.getElementById('lobby-self');
  const statusMsg    = document.getElementById('lobby-status-msg');
  const inviteModal  = document.getElementById('lobby-invite-modal');
  const inviteText   = document.getElementById('lobby-invite-text');
  const inviteAccept = document.getElementById('lobby-invite-accept');
  const inviteDecline= document.getElementById('lobby-invite-decline');
  const mapSizeSel   = document.getElementById('lobby-map-size');

  let myConnId      = null;
  let myName        = null;
  let pendingInvite = null; // { fromConnId, fromName, mapW, mapH }
  let lastRoster    = [];

  // Populate the map-size dropdown from the supplied presets. The chosen value
  // is read at invite-time, so each invite can carry a different size.
  if (mapSizeSel) {
    mapSizeSel.textContent = '';
    for (const [key, def] of Object.entries(presets)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = def.label;
      if (key === defaultPreset) opt.selected = true;
      mapSizeSel.appendChild(opt);
    }
  }

  function selectedPreset() {
    const key = (mapSizeSel && mapSizeSel.value) || defaultPreset;
    return presets[key] || presets[defaultPreset];
  }

  // Match a server-reported (w, h) to its preset label for the invite text.
  function labelFor(mapW, mapH) {
    for (const def of Object.values(presets)) {
      if (def.w === mapW && def.h === mapH) return def.label;
    }
    return `${mapW}x${mapH}`;
  }

  function showNameModal() {
    namePanel.style.display = '';
    nameInput.focus();
  }
  function hideNameModal() { namePanel.style.display = 'none'; }

  function showPlayersPanel() { playersPanel.style.display = ''; }
  function hidePlayersPanel() { playersPanel.style.display = 'none'; }

  function showInviteModal(text) {
    inviteText.textContent = text;
    inviteModal.style.display = '';
  }
  function hideInviteModal() {
    inviteModal.style.display = 'none';
    pendingInvite = null;
  }

  function renderRoster() {
    playersList.innerHTML = '';
    const others = lastRoster.filter(p => p.connId !== myConnId);
    if (others.length === 0) {
      const li = document.createElement('li');
      li.textContent = '(waiting for other players…)';
      li.style.fontStyle = 'italic';
      li.style.color = '#888';
      playersList.appendChild(li);
      return;
    }
    for (const p of others) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'name';
      span.textContent = p.name;
      const btn = document.createElement('button');
      btn.textContent = 'Invite';
      btn.addEventListener('click', () => {
        const preset = selectedPreset();
        transport.invite(p.connId, preset.w, preset.h);
        setStatus(`Invited ${p.name} (${preset.label})…`);
      });
      li.appendChild(span);
      li.appendChild(btn);
      playersList.appendChild(li);
    }
  }

  function setStatus(text) {
    statusMsg.textContent = text || '';
  }

  function submitName() {
    const value = nameInput.value.trim();
    if (!value) {
      nameError.textContent = 'Name cannot be empty.';
      return;
    }
    nameError.textContent = '';
    transport.setName(value);
  }

  // --- Public bindings: called from bootstrap on each transport callback ---

  function onLobbyHello({ connId }) {
    myConnId = connId;
    showNameModal();
  }

  function onPlayers(list) {
    lastRoster = list || [];
    if (myName) renderRoster();
  }

  function onNameAccepted({ name }) {
    myName = name;
    hideNameModal();
    selfLabel.textContent = `You: ${name}`;
    showPlayersPanel();
    renderRoster();
    setStatus('Pick a player to invite, or wait for an invite.');
  }

  function onNameRejected({ reason }) {
    const msg = reason === 'duplicate' ? 'That name is taken.'
              : reason === 'too-long'  ? 'Name too long (max 24).'
              : reason === 'empty'     ? 'Name cannot be empty.'
              : `Name rejected (${reason}).`;
    nameError.textContent = msg;
    showNameModal();
  }

  function onInvited({ fromConnId, fromName, mapW, mapH }) {
    pendingInvite = { fromConnId, fromName, mapW, mapH };
    showInviteModal(`${fromName} invites you to a ${labelFor(mapW, mapH)} match`);
  }

  function onInviteDeclined({ byConnId }) {
    const who = lastRoster.find(p => p.connId === byConnId);
    setStatus(`${who ? who.name : 'Player'} declined your invite.`);
  }

  function onInviteFailed({ reason }) {
    setStatus(`Invite failed: ${reason}.`);
    hideInviteModal();
  }

  function onMatchStart() {
    hideNameModal();
    hideInviteModal();
    hidePlayersPanel();
    setStatus('');
  }

  function onMatchEnded({ reason, winner }) {
    showPlayersPanel();
    const reasonText = reason === 'opponent-disconnected'
      ? 'Opponent disconnected — you win!'
      : (winner ? `${winner} wins.` : 'Match ended.');
    setStatus(reasonText);
  }

  function onFull() {
    nameError.textContent = 'Server is full — a match is in progress. Try again later.';
    showNameModal();
  }

  // --- DOM wiring ---

  nameSubmit.addEventListener('click', submitName);
  nameInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') submitName();
  });

  const loadReplayBtn = document.getElementById('lobby-load-replay');
  if (loadReplayBtn && onLoadReplay) {
    loadReplayBtn.addEventListener('click', () => onLoadReplay());
  }

  const playVsAIBtn = document.getElementById('lobby-play-vs-ai');
  if (playVsAIBtn && onPlayVsAI) {
    playVsAIBtn.addEventListener('click', () => {
      hidePlayersPanel();
      onPlayVsAI();
    });
  }

  inviteAccept.addEventListener('click', () => {
    if (!pendingInvite) return;
    transport.acceptInvite(pendingInvite.fromConnId, pendingInvite.mapW, pendingInvite.mapH);
    hideInviteModal();
  });
  inviteDecline.addEventListener('click', () => {
    if (!pendingInvite) return;
    transport.declineInvite(pendingInvite.fromConnId);
    hideInviteModal();
  });

  return {
    onLobbyHello, onPlayers,
    onNameAccepted, onNameRejected,
    onInvited, onInviteDeclined, onInviteFailed,
    onMatchStart, onMatchEnded,
    onFull,
  };
}
