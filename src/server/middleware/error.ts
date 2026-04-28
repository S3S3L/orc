import { Request, Response, NextFunction } from 'express';

export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message });
}

export function notFoundMiddleware(_req: Request, res: Response, _next: NextFunction) {
  res.status(404).json({ error: 'Not found' });
}
