'use strict';

// Deletes ELECTRON_RUN_AS_NODE before spawning Electron, because when that
// variable is defined (even empty), Electron enters Node.js runtime mode and
// never initialises the main process.

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
