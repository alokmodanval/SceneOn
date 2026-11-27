import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { handleAiChatRequest } from './functions/api/ai-chat.ts';

function localAiChatDevPlugin(apiKey: string): Plugin {
  return {
    name: 'friendsclub-local-ai-chat',
    configureServer(server) {
      server.middlewares.use('/api/ai-chat', (req, res, next) => {
        if (req.method !== 'POST') {
          if (req.method === 'OPTIONS') {
            res.statusCode = 204;
            res.end();
            return;
          }
          next();
          return;
        }

        const chunks: Buffer[] = [];
        let totalBytes = 0;

        req.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes <= 32768) {
            chunks.push(chunk);
          }
        });

        req.on('end', async () => {
          if (totalBytes > 32768) {
            res.statusCode = 413;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Payload too large' }));
            return;
          }

          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
            const result = await handleAiChatRequest(parsed, apiKey);
            res.statusCode = result.status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result.data));
          } catch {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const groqKey = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';

  return {
    plugins: [react(), localAiChatDevPlugin(groqKey)],
  };
});
