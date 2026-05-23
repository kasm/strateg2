// Identify which process is holding a requested TCP port. Used by index.js
// when the server fails to bind so the operator gets an immediately actionable
// hint instead of an opaque EADDRINUSE.
//
// Best-effort, never throws.
//   Windows: netstat -ano + PowerShell Get-CimInstance for full command line +
//            exe path. (Process cwd is not exposed via Win32 CLI tools without
//            third-party utilities like Sysinternals `handle.exe` — the script
//            path inside the command line is usually enough to identify the
//            source.)
//   POSIX:   lsof for listener + cwd + ps for full args.

import { execFile } from 'node:child_process';

/**
 * @param {number} port
 * @returns {Promise<string>} human-readable multi-line report
 */
export function diagnosePortHolder(port) {
  const run = (cmd, args) => new Promise(resolve => {
    execFile(cmd, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? '' : stdout));
  });

  if (process.platform === 'win32') {
    return run('netstat.exe', ['-ano', '-p', 'TCP']).then(out => {
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/\s\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (m && Number(m[1]) === port) pids.add(m[2]);
      }
      if (pids.size === 0) return `  (no LISTENING socket found on :${port} — the port may belong to a non-TCP listener or another user's session)`;
      return Promise.all([...pids].map(pid => describeWindowsPid(pid, run))).then(rows => rows.join('\n\n'));
    });
  }
  return run('lsof', ['-iTCP:' + port, '-sTCP:LISTEN', '-Pn']).then(out => {
    if (!out.trim()) return `  (lsof returned nothing — install lsof or check manually with: ss -lptn 'sport = :${port}')`;
    const pids = new Set();
    for (const line of out.split(/\r?\n/).filter(l => l && !l.startsWith('COMMAND'))) {
      const parts = line.trim().split(/\s+/);
      if (parts[1]) pids.add(parts[1]);
    }
    return Promise.all([...pids].map(pid => describePosixPid(pid, run))).then(rows => rows.join('\n\n'));
  });
}

function describeWindowsPid(pid, run) {
  const psScript =
    `$ErrorActionPreference='SilentlyContinue';` +
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";` +
    `if ($p) { '{0}|{1}|{2}' -f $p.Name, $p.ExecutablePath, $p.CommandLine }`;
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript]).then(out => {
    const first = (out.split(/\r?\n/).find(l => l.trim()) || '').trim();
    const [name = '<unknown>', exe = '', cmdline = ''] = first.split('|');
    const lines = [
      `  PID ${pid}  →  ${name}`,
      exe     ? `    exe : ${exe}`     : null,
      cmdline ? `    args: ${cmdline}` : null,
      `    cwd : (not exposed by Windows CLI — see the script path inside args above)`,
    ].filter(Boolean);
    return lines.join('\n');
  });
}

function describePosixPid(pid, run) {
  return Promise.all([
    run('ps',   ['-p', pid, '-o', 'comm=,args=']),
    run('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']),
  ]).then(([psOut, lsofOut]) => {
    const psLine = (psOut.split(/\r?\n/)[0] || '').trim();
    const [comm, ...rest] = psLine.split(/\s+/);
    const args = rest.join(' ');
    const cwdLine = (lsofOut.split(/\r?\n/).find(l => l.startsWith('n')) || '').slice(1);
    return [
      `  PID ${pid}  →  ${comm || '<unknown>'}`,
      args    ? `    args: ${args}` : null,
      cwdLine ? `    cwd : ${cwdLine}` : null,
    ].filter(Boolean).join('\n');
  });
}
