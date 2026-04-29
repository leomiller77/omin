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
  isGlobal: boolean;
}

export function injectHost(
  projectRoot: string,
  host: HostType,
  force = false,
): InjectionResult {
  if (host === 'claude-code') {
    return injectClaudeCode(projectRoot, force);
  } else {
    return injectCodexCli(projectRoot, force);
  }
}

function injectClaudeCode(projectRoot: string, force: boolean): InjectionResult {
  // Claude Code discovers project-local skills at .claude/skills/<name>/SKILL.md
  const skillDir = path.join(projectRoot, '.claude', 'skills', 'omin');
  const skillPath = path.join(skillDir, 'SKILL.md');

  ensureDir(skillDir);

  if (!force && fileExists(skillPath)) {
    log.warn(`Skill 文件已存在，跳过写入 → ${skillPath}`);
    log.info('如需强制覆盖，请使用 omin init --force');
    return { written: [], skipped: [skillPath], installPath: skillPath, isGlobal: false };
  }

  const content = readSkillContent();
  atomicWrite(skillPath, content);
  return { written: [skillPath], skipped: [], installPath: skillPath, isGlobal: false };
}

function injectCodexCli(projectRoot: string, force: boolean): InjectionResult {
  // Codex CLI discovers project-local skills at <project>/.agents/skills/<name>/SKILL.md
  // via repo_agents_skill_roots() — this works WITHOUT any user config layers.
  // Reference: codex-rs/core-skills/src/loader.rs :: repo_agents_skill_roots()
  const skillDir = path.join(projectRoot, '.agents', 'skills', 'omin');
  const skillPath = path.join(skillDir, 'SKILL.md');

  ensureDir(skillDir);

  if (!force && fileExists(skillPath)) {
    log.warn(`Skill 文件已存在，跳过写入 → ${skillPath}`);
    log.info('如需强制覆盖，请使用 omin init --force');
    return { written: [], skipped: [skillPath], installPath: skillPath, isGlobal: false };
  }

  const content = readSkillContent();
  atomicWrite(skillPath, content);

  // Also attempt global install to ~/.agents/skills/omin/ for user-scope discovery.
  // This works when the user has a ~/.codex/config.toml (User config layer).
  tryGlobalInstall(content, force);

  return { written: [skillPath], skipped: [], installPath: skillPath, isGlobal: false };
}

function tryGlobalInstall(content: string, force: boolean): void {
  try {
    const globalSkillDir = path.join(os.homedir(), '.agents', 'skills', 'omin');
    const globalSkillPath = path.join(globalSkillDir, 'SKILL.md');
    if (force || !fileExists(globalSkillPath)) {
      ensureDir(globalSkillDir);
      atomicWrite(globalSkillPath, content);
      log.info(`  全局 Skill 同步 → ${globalSkillPath}`);
    }
  } catch {
    // Non-fatal: project-local install is sufficient.
  }
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
  // Primary install: project-local .agents/skills/omin/SKILL.md
  return path.join(projectRoot, '.agents', 'skills', 'omin', 'SKILL.md');
}

export function getHostSkillDir(projectRoot: string, host: HostType): string {
  if (host === 'claude-code') {
    return path.join(projectRoot, '.claude', 'skills', 'omin');
  }
  return path.join(projectRoot, '.agents', 'skills', 'omin');
}
