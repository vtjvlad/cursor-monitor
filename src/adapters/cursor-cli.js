import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
const execFileAsync = promisify(execFile);
async function runCursor(args, timeout = 5000) {
  try {
    const result = await execFileAsync(config.cursorBin, args, {
      cwd: config.home,
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${path.dirname(config.cursorBin)}:${process.env.PATH || '/usr/bin:/bin'}`
      }
    });
    return {
      ok: true,
      output: result.stdout.trim(),
      error: result.stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      output: String(error.stdout || '').trim(),
      error: String(error.stderr || error.message).trim()
    };
  }
}
export async function getPersistentSessions() {
  const result = await runCursor(['persist', 'list']);
  // Пока сохраняем формат вывода для диагностики:
  // не предполагаем, что каждая строка является сессией.
  const lines = result.output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  return {
    available: result.ok,
    source: 'agent persist list',
    sessions: [],
    rawLines: lines,
    message: result.ok
      ? (lines.join('\n') || 'CLI returned no session information')
      : 'Could not read persistent sessions',
    error: result.ok ? null : result.error
  };
}
export async function getAgentProcesses() {
  let stdout;
  try {
    const result = await execFileAsync(
      '/usr/bin/ps',
      ['-eo', 'pid=,ppid=,user=,stat=,etime=,args='],
      { timeout: 3000, maxBuffer: 2 * 1024 * 1024 }
    );
    stdout = result.stdout;
  } catch {
    return { available: false, processes: [] };
  }
  const processes = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.trim().match(
      /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s|$)/
    );
    if (!match) continue;
    const [, pidText, ppidText, user, state, elapsed, executable] = match;
    const base = path.basename(executable);
    // Проверяем только имя исполняемого файла, а не текст промпта.
    if (!['agent', 'cursor-agent'].includes(base)) continue;
    const pid = Number(pidText);
    let cwd = null;
    try {
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      // Процесс мог завершиться или быть недоступен.
    }
    processes.push({
      id: `process:${pid}`,
      kind: 'process',
      pid,
      ppid: Number(ppidText),
      user,
      state,
      elapsed,
      executable: base,
      cwd
    });
  }
  return { available: true, processes };
}
