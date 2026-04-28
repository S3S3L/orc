#!/usr/bin/env node
import express from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { GLOBAL_CONTEXT } from '../utils/GlobalContext.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.js';
import workflowRoutes from './routes/workflow.js';
import sessionsRoutes from './routes/sessions.js';
import nodesRoutes from './routes/nodes.js';
import loopRoutes from './routes/loop.js';

export interface ServerOptions {
  port: number;
  host: string;
  outputDir: string;
  auditDir: string;
  workspaceDir: string;
}

export async function createServer(workflowPath: string | undefined, options: ServerOptions) {
  let workflowDir = process.cwd();
  if (workflowPath) {
    const content = await fs.readFile(workflowPath, 'utf-8');
    GLOBAL_CONTEXT.lastWorkflow = JSON.parse(content);
    workflowDir = path.resolve(path.dirname(workflowPath));
  }

  GLOBAL_CONTEXT.workflowDir = workflowDir;
  GLOBAL_CONTEXT.outputDir = path.resolve(options.outputDir);
  GLOBAL_CONTEXT.auditDir = path.resolve(options.auditDir);
  GLOBAL_CONTEXT.workspaceDir = path.resolve(options.workspaceDir);
  await GLOBAL_CONTEXT.setStorePath(GLOBAL_CONTEXT.outputDir);

  const app = express();

  app.use(corsMiddleware);
  app.use(express.json());

  app.use('/api/v1', workflowRoutes);
  app.use('/api/v1', sessionsRoutes);
  app.use('/api/v1/nodes', nodesRoutes);
  app.use('/api/v1/loops', loopRoutes);

  // Serve frontend static files (production build)
  const frontendDist = path.join(__dirname, '../../../frontend/dist');
  try {
    await fs.access(frontendDist);
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  } catch {
    // Frontend not built, API only
  }

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

export function startServer(workflowPath: string | undefined, options: ServerOptions) {
  return createServer(workflowPath, options).then(app => {
    return new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const server = app.listen(options.port, options.host, () => {
        const displayHost = options.host === '0.0.0.0' ? 'localhost' : options.host;
        console.log(`ORC Web UI started at http://${displayHost}:${options.port}`);
        console.log(`Loaded workflow: ${workflowPath || 'none'}`);
        console.log('Press Ctrl+C to stop');
        resolve(server);
      });
    });
  });
}

// Allow running directly: node dist/src/server/server.ts
if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';
  const workflowPath = process.argv[2];
  startServer(workflowPath, {
    port,
    host,
    outputDir: process.env.OUTPUT_DIR || './output',
    auditDir: process.env.AUDIT_DIR || './audit',
    workspaceDir: process.env.WORKSPACE_DIR || './workspace',
  });
}
