const { spawn } = require('child_process');
const path = require('path');

const service = process.env.SERVICE;

if (!service) {
  console.error('ERROR: SERVICE environment variable is not set');
  console.error('Set SERVICE to one of: api, voice-engine, dashboard');
  process.exit(1);
}

let command;
let args;
let cwd = process.cwd();

switch (service) {
  case 'api':
    command = 'node';
    args = ['apps/api/dist/index.js'];
    break;
  case 'voice-engine':
    command = 'node';
    args = ['apps/voice-engine/dist/index.js'];
    break;
  case 'dashboard':
    command = 'node';
    args = ['apps/dashboard/.next/standalone/apps/dashboard/server.js'];
    break;
  default:
    console.error(`ERROR: Unknown SERVICE: ${service}`);
    console.error('Set SERVICE to one of: api, voice-engine, dashboard');
    process.exit(1);
}

console.log(`Starting ${service} service...`);

const child = spawn(command, args, {
  cwd,
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error(`Failed to start ${service}:`, err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
