import {
  getPersistentSessions,
  getAgentProcesses
} from '../adapters/cursor-cli.js';
export async function discoverSessions() {
  const [persistent, processes] = await Promise.all([
    getPersistentSessions(),
    getAgentProcesses()
  ]);
  return {
    collectedAt: new Date().toISOString(),
    persistent,
    processes
  };
}
