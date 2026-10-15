import { Router } from 'express';
import { discoverSessions } from '../services/session-discovery.js';
const router = Router();
router.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await discoverSessions());
  } catch (error) {
    next(error);
  }
});
export default router;
