import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer ([a-f0-9]+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const supplied = Buffer.from(match[1]);
  const expected = Buffer.from(config.token);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
