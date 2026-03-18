import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function createTmpNotifierHome(): Promise<{ home: string; cleanup: () => Promise<void> }> {
  const home = await mkdtemp(join(tmpdir(), 'notifier-test-'));
  process.env['NOTIFIER_HOME'] = home;

  const cleanup = async () => {
    delete process.env['NOTIFIER_HOME'];
    await rm(home, { recursive: true, force: true });
  };

  return { home, cleanup };
}
