import { Router } from 'express';
import {
  getCurrentTask,
  startAgent,
  stopAgent
} from '../services/agent-runner.js';

const router = Router();

router.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ task: getCurrentTask() });
});

router.post('/', async (req, res, next) => {
  try {
    const task = await startAgent(req.body || {});
    res.set('Cache-Control', 'no-store');
    res.status(202).json({ task });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    if (error.code === 'ENOENT') {
      return res.status(500).json({ error: 'Cursor CLI не найден по настроенному пути.' });
    }

    if (error.code === 'EACCES') {
      return res.status(500).json({ error: 'Нет прав для запуска Cursor CLI.' });
    }

    if (error.message?.includes('директори') ||
        error.message?.includes('каталог') ||
        error.message?.includes('путь') ||
        error.message?.includes('промпт') ||
        error.message?.includes('символов')) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

router.post('/:id/stop', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ task: stopAgent(req.params.id) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

export default router;
