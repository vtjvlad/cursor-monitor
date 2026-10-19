import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

const workspaceRoot = path.join(config.home, 'server');
const MAX_OUTPUT = 200_000;
const MAX_PROMPT = 12_000;

let currentTask = null;

function snapshot(task) {
  return {
    id: task.id,
    status: task.status,
    cwd: task.cwd,
    prompt: task.prompt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    exitCode: task.exitCode,
    output: task.output,
    truncated: task.truncated
  };
}

function appendOutput(task, chunk) {
  const text = chunk.toString('utf8');
  const remaining = MAX_OUTPUT - task.output.length;

  if (remaining > 0) {
    task.output += text.slice(0, remaining);
  }

  if (text.length > remaining) {
    task.truncated = true;
  }
}

async function validateWorkspace(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Укажи рабочую директорию.');
  }

  if (input.length > 1024 || input.includes('\0')) {
    throw new Error('Некорректный путь к рабочей директории.');
  }

  const requested = path.resolve(input.trim());
  const root = await fs.realpath(workspaceRoot);
  const resolved = await fs.realpath(requested);

  if (resolved === root || !resolved.startsWith(root + path.sep)) {
    throw new Error(`Разрешены только каталоги внутри ${root}, кроме самого корня.`);
  }

  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Рабочий путь должен указывать на каталог.');
  }

  return resolved;
}

export function getCurrentTask() {
  return currentTask ? snapshot(currentTask) : null;
}

export async function startAgent({ cwd, prompt }) {
  if (currentTask?.status === 'running' || currentTask?.status === 'stopping') {
    const error = new Error('Агент уже выполняет задачу. Сначала останови её.');
    error.statusCode = 409;
    throw error;
  }

  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Промпт не должен быть пустым.');
  }

  if (prompt.length > MAX_PROMPT) {
    throw new Error(`Максимальная длина промпта — ${MAX_PROMPT} символов.`);
  }

  const directory = await validateWorkspace(cwd);
  const task = {
    id: randomUUID(),
    status: 'starting',
    cwd: directory,
    prompt: prompt.trim(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    exitCode: null,
    output: '',
    truncated: false,
    child: null
  };

  currentTask = task;

  try {
    const child = spawn(
      config.cursorBin,
      [
        '--print',
        '--output-format', 'text',
        '--workspace', directory,
        task.prompt
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          PATH: `${path.dirname(config.cursorBin)}:${process.env.PATH || '/usr/bin:/bin'}`
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true
      }
    );

    task.child = child;
    task.status = 'running';

    child.stdout.on('data', chunk => appendOutput(task, chunk));
    child.stderr.on('data', chunk => appendOutput(task, chunk));

    child.on('error', error => {
      appendOutput(task, `\n[Ошибка запуска] ${error.message}\n`);
      task.status = 'failed';
      task.finishedAt = new Date().toISOString();
    });

    child.on('close', (code, signal) => {
      task.exitCode = code;
      task.finishedAt = new Date().toISOString();

      if (task.status === 'stopping') {
        task.status = 'stopped';
      } else if (task.status !== 'failed') {
        task.status = code === 0 ? 'completed' : 'failed';
      }

      if (signal) appendOutput(task, `\n[Процесс завершён сигналом ${signal}]\n`);
      task.child = null;
    });

    return snapshot(task);
  } catch (error) {
    task.status = 'failed';
    task.finishedAt = new Date().toISOString();
    throw error;
  }
}

export function stopAgent(id) {
  const task = currentTask;

  if (!task || task.id !== id) {
    const error = new Error('Задача не найдена.');
    error.statusCode = 404;
    throw error;
  }

  if (!['running', 'starting'].includes(task.status) || !task.child) {
    return snapshot(task);
  }

  task.status = 'stopping';

  try {
    process.kill(-task.child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }

  return snapshot(task);
}
