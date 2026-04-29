import { Command } from 'commander';
import { select, number } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'path';
import { log, spinner, printBanner, printBox } from './utils/logger.js';
import { readConfig, writeConfig, requireConfig } from './utils/config.js';
import { fileExists, resolveProjectRoot } from './utils/fs-helpers.js';
import { injectHost, getHostLabel, getHostConfigPath } from './modules/init/host-injector.js';
import { scaffoldWorkspace } from './modules/init/scaffolder.js';
import { renderStatus } from './modules/status/reporter.js';
import { readTask, isTaskEmpty, clearTask } from './modules/context/task-writer.js';
import { appendMilestone, appendStash, readState } from './modules/archiver/state-writer.js';
import { generateMilestone } from './modules/archiver/summarizer.js';

const program = new Command();

program
  .name('omin')
  .description('AI workflow harness for Codex CLI and Claude Code')
  .version('1.0.0');

program
  .command('init')
  .description('初始化 Omin 工作区，注入宿主配置')
  .option('--force', '强制覆盖已存在的配置文件')
  .action(async (options: { force: boolean }) => {
    const projectRoot = resolveProjectRoot();
    printBanner('AI Workflow Harness — omin init');

    const host = await select<'claude-code' | 'codex-cli'>({
      message: '请选择当前 Omin 需挂载的宿主 AI 引擎：',
      choices: [
        { name: 'Claude Code', value: 'claude-code' },
        { name: 'Codex CLI', value: 'codex-cli' },
      ],
    });

    const maxRetries = await number({
      message: '闭环最大重试次数（默认：5）：',
      default: 5,
      validate: (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n > 0 ? true : '请输入正整数';
      },
    });

    const hostSpinner = spinner('正在写入宿主配置文件...');
    const injectionResult = injectHost(projectRoot, host, options.force);
    const configFilePath = getHostConfigPath(projectRoot, host);

    if (injectionResult.skipped.length > 0 && injectionResult.written.length === 0) {
      hostSpinner.warn(chalk.yellow('宿主配置已存在，跳过写入 → ' + log.path(configFilePath)));
    } else {
      const rel = path.relative(projectRoot, configFilePath);
      hostSpinner.succeed(chalk.green('宿主配置已写入 → ') + log.path(rel));
    }

    const scaffoldSpinner = spinner('正在生成工作区目录...');
    const scaffoldResult = scaffoldWorkspace(projectRoot);
    scaffoldSpinner.succeed(chalk.green('工作区已就绪 → ') + log.path('.omin/'));

    for (const f of scaffoldResult.created) {
      log.info('  创建 ' + log.path(f));
    }
    for (const f of scaffoldResult.skipped) {
      console.log(chalk.gray('  · 跳过（已存在）' + f));
    }

    writeConfig({ host, maxRetries: maxRetries ?? 5, specsDir: '.omin/specs', taskFile: '.omin/task.md', stateFile: '.omin/state.json' }, projectRoot);
    log.success('omin.config.json 已生成');
    console.log();

    const hostLabel = getHostLabel(host);
    const nextStep1 = host === 'claude-code'
      ? '  /omin:spec <需求文档路径>  设置规范'
      : '  /omin:spec <需求文档路径>  设置规范';
    const nextStep2 = '  /omin <需求描述>           启动闭环';

    printBox([
      '✅ Omin 初始化完成',
      '',
      `  下一步：在 ${hostLabel} 中输入`,
      nextStep1,
      nextStep2,
    ]);
  });

program
  .command('status')
  .description('显示 Omin 系统状态快照（同 _internal-status）')
  .action(() => {
    runInternalStatus();
  });

program
  .command('_internal-status')
  .description('[内部] 渲染状态报告（由宿主 Bash Tool 调用）')
  .action(() => {
    runInternalStatus();
  });

program
  .command('_internal-teardown')
  .description('[内部] 归档并清空任务（由宿主 Bash Tool 调用）')
  .option('--mode <mode>', '执行模式：normal（默认）或 interrupt', 'normal')
  .action(async (options: { mode: string }) => {
    await runInternalTeardown(options.mode === 'interrupt');
  });

function runInternalStatus(): void {
  const projectRoot = resolveProjectRoot();
  const ominDir = path.join(projectRoot, '.omin');

  if (!fileExists(ominDir)) {
    log.error('工作区未初始化，请先执行 omin init。');
    process.exit(1);
  }

  const config = readConfig(projectRoot);
  if (!config) {
    log.error('无法读取 omin.config.json，请先执行 omin init。');
    process.exit(1);
  }

  const stateStr = path.join(projectRoot, config.stateFile);
  const state = readState(config, projectRoot);
  if (state === null && fileExists(stateStr)) {
    log.warn('state.json 格式异常，里程碑数据可能已损坏。');
  }

  const specsDir = path.join(projectRoot, config.specsDir);
  if (!fileExists(specsDir)) {
    log.warn('尚未生成任何规范文件。建议先执行 /omin:spec 定义架构约束。');
  }

  const output = renderStatus(config, projectRoot);
  console.log(output);
}

async function runInternalTeardown(interruptMode: boolean): Promise<void> {
  const projectRoot = resolveProjectRoot();
  const ominDir = path.join(projectRoot, '.omin');

  if (!fileExists(ominDir)) {
    log.error('工作区未初始化，请先执行 omin init。');
    process.exit(1);
  }

  const config = (() => {
    try {
      return requireConfig(projectRoot);
    } catch {
      return null;
    }
  })();

  if (!config) {
    log.error('无法读取 omin.config.json，请先执行 omin init。');
    process.exit(1);
  }

  const taskContent = readTask(config, projectRoot);

  if (isTaskEmpty(taskContent)) {
    if (interruptMode) {
      log.info('当前无活跃任务，系统已处于 Idle 状态。');
    } else {
      log.info('task.md 已为空（幂等保护），跳过归档。');
    }
    return;
  }

  if (interruptMode) {
    const archiveSpinner = spinner('正在暂存任务至 stash_queue...');
    appendStash(config, projectRoot, {
      task: taskContent,
      interrupted_at: new Date().toISOString(),
      reason: 'user_interrupt',
    });
    archiveSpinner.succeed(chalk.green('任务已暂存至 stash_queue'));

    clearTask(config, projectRoot);

    console.log();
    log.success('任务已中断，系统归于 Idle 状态。');
    log.info('  已清空 .omin/task.md');
    log.info('  任务草稿已暂存至 state.json → stash_queue（不计入 milestones）');
  } else {
    const archiveSpinner = spinner('正在写入里程碑记录...');
    const milestone = await generateMilestone(taskContent, 0);
    appendMilestone(config, projectRoot, milestone);
    archiveSpinner.succeed(chalk.green('里程碑已归档'));

    clearTask(config, projectRoot);

    const ts = new Date(milestone.timestamp);
    const dateStr = ts.toLocaleString('zh-CN', { timeZone: 'UTC', hour12: false });

    console.log();
    console.log(chalk.green('  ✅ 任务完成！'));
    console.log(chalk.gray('  ' + '─'.repeat(41)));
    console.log(chalk.green('  里程碑已记录：'));
    console.log(chalk.cyan(`  "${milestone.event}"`));
    console.log();
    console.log(chalk.gray(`  耗时迭代：${milestone.retries + 1} 次（重试 ${milestone.retries} 次）`));
    console.log(chalk.gray(`  归档时间：${dateStr}`));
    console.log();
    console.log(chalk.green('  系统已归 Idle ✔'));
    console.log(chalk.gray('  ' + '─'.repeat(41)));
  }
}

program.parseAsync(process.argv).catch((err) => {
  log.error(String(err));
  process.exit(1);
});
