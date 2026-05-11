// Robust Electron launcher.
//
// Some developer machines have ELECTRON_RUN_AS_NODE=1 set globally (often
// installed by other Electron-based tools). When that variable is *defined*
// — even to an empty string — Electron's bootstrap treats the binary as a
// plain Node.js runtime and never enters main-process mode, which makes
// `require('electron')` return the binary path instead of the API.
//
// cross-env can only assign values, not unset them, so we use a tiny Node
// shim that explicitly deletes the variable before spawning Electron.

'use strict';

const { spawn } = require('child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
if (args.length === 0) args.push('.');

const child = spawn(electron, args, { stdio: 'inherit', env });

child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
});

child.on('error', (err) => {
    console.error('Failed to launch Electron:', err);
    process.exit(1);
});
