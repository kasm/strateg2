// Client-only lobby UI controller.
// Owns the name-prompt modal, the right-panel player list, and the invite modal.
// Talks to the server exclusively through the NetTransport methods passed in
// (`setName`, `invite`, `acceptInvite`, `declineInvite`). The match-start hello
// is observed by bootstrap, which calls `onMatchStart()` here to hide lobby UI.
//
// Note: this module is loaded only in MP mode. In SP nothing here runs.

/**
 * @param {{
 *   transport: {
 *     setName:        (name:string) => void,
 *     invite:         (toConnId:string) => void,
 *     acceptInvite:   (fromConnId:string) => void,
 *     declineInvite:  (fromConnId:string) => void,
 *   }
 * }} deps
 */
export function createLobbyUI({ transport }) {
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

  let myConnId      = null;
  let myName        = null;
  let pendingInvite = null; // { fromConnId, fromName }
  let lastRoster    = [];

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
        transport.invite(p.connId);
        setStatus(`Invited ${p.name}…`);
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

  function onInvited({ fromConnId, fromName }) {
    pendingInvite = { fromConnId, fromName };
    showInviteModal(`${fromName} invites you to a match`);
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
    // Bootstrap shows the game-over overlay separately. We just bring the
    // lobby back into view; the server will re-broadcast the roster.
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

  inviteAccept.addEventListener('click', () => {
    if (!pendingInvite) return;
    transport.acceptInvite(pendingInvite.fromConnId);
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
