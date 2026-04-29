import path from 'path';
import { z } from 'zod';
import { atomicWrite, safeReadJson, fileExists, resolveProjectRoot } from './fs-helpers.js';

export const ConfigSchema = z.object({
  host: z.enum(['claude-code', 'codex-cli']),
  maxRetries: z.number().int().positive().default(5),
  testCommand: z.string().default('npm test'),
  specsDir: z.string().default('.omin/specs'),
  taskFile: z.string().default('.omin/task.md'),
  stateFile: z.string().default('.omin/state.json'),
});

export type AegisConfig = z.infer<typeof ConfigSchema>;

const CONFIG_FILENAME = 'omin.config.json';

export function getConfigPath(root?: string): string {
  return path.join(root ?? resolveProjectRoot(), CONFIG_FILENAME);
}

export function readConfig(root?: string): AegisConfig | null {
  const configPath = getConfigPath(root);
  const raw = safeReadJson<unknown>(configPath);
  if (raw === null) return null;
  const parsed = ConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function writeConfig(config: AegisConfig, root?: string): void {
  const configPath = getConfigPath(root);
  atomicWrite(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function configExists(root?: string): boolean {
  return fileExists(getConfigPath(root));
}

export function requireConfig(root?: string): AegisConfig {
  const config = readConfig(root);
  if (!config) {
    throw new Error('项目未初始化，请先执行 omin init。');
  }
  return config;
}
