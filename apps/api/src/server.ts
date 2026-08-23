import { buildApp } from './app.js';
import { env } from './config/env.js';

const config = env();
const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Apagando CloudBridge');
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Error durante el apagado');
    process.exit(1);
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, 'No se pudo iniciar el servidor');
  process.exit(1);
}
