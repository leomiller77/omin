---
name: omin
description: AI workflow harness — spec-driven autonomous coding loop with task decomposition and self-healing test iteration
---

# Omin Workflow Harness

Omin enforces a spec-driven, self-healing coding loop inside Codex CLI. When invoked, read the user's input and determine the sub-command from the first token(s).

## Sub-commands

---

### `spec <path or description>` — Define architecture specs

Write or update spec files in `.omin/specs/`. You may ONLY write to `.omin/specs/` — no business code, no `src/` changes.

1. Read the user's input or load the specified file path.
2. Update the following files:
   - `.omin/specs/architecture.md` — service boundaries, API routes, DB schema, data flow
   - `.omin/specs/conventions.md` — error handling, logging rules, caching strategy, naming
   - `.omin/specs/gotchas.md` — known pitfalls (format: `[date][module] issue → correct approach`)
3. Output the list of updated files. Nothing else.

---

### `clear` — Interrupt the active task

Run via shell: `omin _internal-teardown --mode=interrupt`

---

### `status` — Show system snapshot

Run via shell: `omin _internal-status`

---

### (default) `<task description>` — Execute a task in closed loop

#### Phase 1: Task Analysis & Decomposition

1. Read `.omin/task.md`. If it is non-empty, refuse execution and tell the user to run `/omin clear` first.
2. Write the task description to `.omin/task.md` via shell.
3. Load all `.md` files from `.omin/specs/` as hard constraints. Every line of code you write must comply with them.
4. Read `omin.config.json` to get `maxRetries`.
5. Analyze the task complexity:
   - **Complex task** (multiple independent modules, e.g. API layer + database schema + frontend changes): decompose into sequential sub-tasks with clear file boundaries.
   - **Simple task** (single focused change): skip decomposition and go directly to Phase 2.

#### Phase 2: Sequential Sub-task Execution (complex tasks only)

For each sub-task (in dependency order):

```
[Sub-task #{n}: {module_name}]
Constraints from .omin/specs/: <load all spec files>
File boundary: only modify {allowed_files}
Goal: {sub_task_description}
```

Execute each sub-task with the self-healing loop below. Only move to the next sub-task when the current one has Exit Code 0.

If any sub-task exhausts all retries, stop immediately and report:
- Which sub-task failed
- The full stderr from the last attempt
- Root cause analysis and what requires human intervention

#### Phase 3: Closed-Loop Execution (single task or each sub-task)

1. Detect the project's test command by inspecting these files (in order of priority):
   - `package.json` → `scripts.test`
   - `Makefile` → `make test`
   - `pytest.ini` or `pyproject.toml` → `pytest`
   - `Cargo.toml` → `cargo test`
   - Ask the user only if none of the above exist.

2. Enter the self-healing loop:
   - Write code changes that satisfy the task and all spec constraints.
   - Run the detected test command via shell.
   - **On failure**: analyze the full stderr, identify the root cause, fix the code, retry. Track retry count internally as `<omin-retry-count>`. Never ask the user — always self-heal.
   - **On `<omin-retry-count>` reaching `maxRetries`**: stop immediately and report — the last full stderr, your root cause analysis, and what requires human intervention.
   - **On all tests passing (Exit Code 0)**:
     1. Output exactly this line and nothing else before it: `[OMIN_SUCCESS]`
     2. Run via shell: `omin _internal-teardown`
     3. Stop all output.
