import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWrite, fileExists, ensureDir } from '../../utils/fs-helpers.js';
import { log } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SKILL_SRC = path.join(__dirname, '../../../skills/omin/SKILL.md');

export type HostType = 'claude-code' | 'codex-cli';

export interface InjectionResult {
  written: string[];
  skipped: string[];
  installPath: string;
}

export function injectHost(
  projectRoot: string,
  host: HostType,
  force = false,
): InjectionResult {
  if (host === 'claude-code') {
    return injectClaudeCode(projectRoot, force);
  } else {
    return injectCodexCli(force);
  }
}

function injectClaudeCode(projectRoot: string, force: boolean): InjectionResult {
  const skillDir = path.join(projectRoot, '.claude', 'skills', 'omin');
  const skillPath = path.join(skillDir, 'SKILL.md');

  ensureDir(skillDir);

  if (!force && fileExists(skillPath)) {
    log.warn(`Skill 文件已存在，跳过写入 → ${skillPath}`);
    log.info('如需强制覆盖，请使用 omin init --force');
    return { written: [], skipped: [skillPath], installPath: skillPath };
  }

  const content = readSkillContent();
  atomicWrite(skillPath, content);
  return { written: [skillPath], skipped: [], installPath: skillPath };
}

function injectCodexCli(force: boolean): InjectionResult {
  const skillDir = path.join(os.homedir(), '.agents', 'skills', 'omin');
  const skillPath = path.join(skillDir, 'SKILL.md');

  ensureDir(skillDir);

  if (!force && fileExists(skillPath)) {
    log.warn(`Skill 文件已存在，跳过写入 → ${skillPath}`);
    log.info('如需强制覆盖，请使用 omin init --force');
    return { written: [], skipped: [skillPath], installPath: skillPath };
  }

  const content = readSkillContent();
  atomicWrite(skillPath, content);
  return { written: [skillPath], skipped: [], installPath: skillPath };
}

function readSkillContent(): string {
  try {
    return fs.readFileSync(SKILL_SRC, 'utf8');
  } catch {
    throw new Error(
      `无法读取 Skill 源文件：${SKILL_SRC}\n请确认 @leomiller/omin 安装完整。`,
    );
  }
}

export function getHostLabel(host: HostType): string {
  return host === 'claude-code' ? 'Claude Code' : 'Codex CLI';
}

export function getHostConfigPath(projectRoot: string, host: HostType): string {
  if (host === 'claude-code') {
    return path.join(projectRoot, '.claude', 'skills', 'omin', 'SKILL.md');
  }
  return path.join(os.homedir(), '.agents', 'skills', 'omin', 'SKILL.md');
}

export function getHostSkillDir(projectRoot: string, host: HostType): string {
  if (host === 'claude-code') {
    return path.join(projectRoot, '.claude', 'skills', 'omin');
  }
  return path.join(os.homedir(), '.agents', 'skills', 'omin');
}
