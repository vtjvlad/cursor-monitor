import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}
export const config = Object.freeze({
  host: process.env.MONITOR_HOST || '127.0.0.1',
  port: Number(process.env.MONITOR_PORT || 8787),
  token: process.env.MONITOR_TOKEN || '',
  home: os.homedir(),
  cursorBin: path.join(os.homedir(), '.local/bin/agent')
});
if (!config.token || config.token.length < 32) {
  throw new Error('MONITOR_TOKEN is missing or too short');
}
if (config.host !== '127.0.0.1' && config.host !== '::1') {
  throw new Error('Initial version must listen on loopback only');
}
