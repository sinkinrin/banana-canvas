import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startLocalServer } from './src/server/startLocalServer';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const server = await startLocalServer({
    rootDir,
    repairInvalidEnvFile: false,
  });
  console.log(`Server running on ${server.url}`);

  let isClosing = false;
  const close = () => {
    if (isClosing) return;
    isClosing = true;
    void server.close().finally(() => process.exit(0));
  };

  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
