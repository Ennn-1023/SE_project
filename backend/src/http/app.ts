import express from 'express';
import cors from 'cors';
import type { AppContext } from '../context';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { studentRouter } from './routes/student';
import { devAuthRouter } from './routes/devAuth';
import { devResultsRouter, devTeacherRouter } from './routes/devTeacher';

export function createApp(ctx: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: ctx.config.clientOrigin }));
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/student', studentRouter(ctx));
  if (ctx.config.enableDevTools) {
    app.use('/api/dev', devAuthRouter(ctx));
    app.use('/api/dev/teacher', devTeacherRouter(ctx));
    app.use('/api/dev', devResultsRouter(ctx));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
