---
name: omin
description: Spec-driven autonomous coding loop — write specs, execute tasks with self-healing test iteration, and dispatch multi-agent workflows. Run `/omin <task>`, `/omin spec <doc>`, `/omin clear`, or `/omin status`.
---

# Omin Workflow Harness

Omin enforces a spec-driven, self-healing coding loop. Parse the user's input and route to the correct sub-command based on the first keyword.

## Routing

- First token is `spec` → run **Spec Mode**
- First token is `clear` → run **Clear Mode**
- First token is `status` → run **Status Mode**
- Anything else → run **Execute Mode**

---

## Spec Mode — `/omin spec <path or description>`

**Goal:** Produce architecture spec files only. Zero business code.

1. Read the user's input or load the file at the given path.
2. Write or update these files (create them if they don't exist):
   - `.omin/specs/architecture.md` — service boundaries, API routes, DB schema, data flow
   - `.omin/specs/conventions.md` — error handling, logging, caching, naming rules
   - `.omin/specs/gotchas.md` — known pitfalls, format: `[date][module] issue → correct approach`
3. Output the list of updated files. Nothing else.
4. **Hard constraint:** Only write to `.omin/specs/`. Never touch `src/`, `lib/`, `app/`, or any non-`.omin/` path.

---

## Clear Mode — `/omin clear`

Run via shell: `omin _internal-teardown --mode=interrupt`

If `.omin/task.md` is non-empty, confirm with the user before running.

---

## Status Mode — `/omin status`

Run via shell: `omin _internal-status`

Print the output exactly as returned.

---

## Execute Mode — `/omin <task description>`

### Phase 1 — Pre-flight

1. Read `.omin/task.md`. If non-empty, refuse and tell the user to run `/omin clear` first.
2. Write the full task description to `.omin/task.md` via shell.
3. Load **all** `.md` files from `.omin/specs/` — these are hard constraints. Every line of code you write must comply.
4. Read `omin.config.json` → get `maxRetries` (default 5 if file is missing).
5. Detect the project test command (in priority order):
   - `package.json` → `scripts.test`
   - `Makefile` → look for `test:` or `check:` target
   - `pytest.ini` or `pyproject.toml` → use `pytest`
   - `Cargo.toml` → use `cargo test`
   - If none found, ask the user once, then proceed.

### Phase 2 — Task Decomposition

Analyze whether the task is **complex** (multiple independent modules with clear file boundaries) or **simple** (single focused change).

**Simple task** → skip to Phase 3 single-agent loop.

**Complex task** → decompose into 2–5 sub-tasks, each with:
- A specific module name
- A non-overlapping file boundary (no two sub-tasks touch the same file)
- Inherited spec constraints from `.omin/specs/`

For Claude Code: dispatch sub-tasks in parallel using the Task tool. Each sub-agent receives this prompt:

```
[Sub-Agent #{n}: {module}]

Spec constraints (load and obey all of these):
{contents of .omin/specs/*.md}

File boundary: you may ONLY modify these files/directories:
{allowed_files}

Your task:
{sub_task_description}

Rules:
- Detect test command from package.json / Makefile / pytest.ini / Cargo.toml
- Run tests after every code change
- Self-heal on failure — never ask the user, max {maxRetries} retries
- On success (Exit Code 0): output exactly `[OMIN_SUB_SUCCESS #{n}]`
- On exhausting retries: output `[OMIN_SUB_FAIL #{n}]` followed by full stderr and root cause
```

Wait for all sub-agents. If any returns `[OMIN_SUB_FAIL]`, stop and report to the user.

For Codex CLI: run sub-tasks sequentially. Apply the same rules but loop through them one at a time.

### Phase 3 — Self-Healing Execution Loop

*(For simple tasks, or each sub-task in sequential mode)*

```
omin-retry-count = 0

loop:
  1. Write code changes satisfying the task + all spec constraints
  2. Run detected test command via shell
  3. if Exit Code 0 → go to Phase 4
  4. if Exit Code ≠ 0:
       - Read full stderr (never truncate)
       - Identify root cause
       - Fix code
       - omin-retry-count++
       - if omin-retry-count >= maxRetries → go to CIRCUIT BREAK
       - else → loop

CIRCUIT BREAK:
  Report to user:
    - Retry count reached: {maxRetries}
    - Last full stderr output (complete, no truncation)
    - Root cause analysis
    - Specific files or issues requiring human intervention
  Stop all output.
```

### Phase 4 — Teardown

When all tests pass (or all sub-agents succeed + integration test passes):

1. Output this line, standalone, with nothing else on it:
   ```
   [OMIN_SUCCESS]
   ```
2. Run via shell: `omin _internal-teardown`
3. Stop all output immediately.
