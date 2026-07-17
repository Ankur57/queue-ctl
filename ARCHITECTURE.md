# QueueCTL — Architecture & Design Document

> A deep-dive into the system architecture, design decisions, component interactions, and data flow of the QueueCTL background job queue system.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [System Architecture](#system-architecture)
- [Component Design](#component-design)
  - [CLI Layer](#1-cli-layer)
  - [Service Layer](#2-service-layer)
  - [Queue Layer](#3-queue-layer)
  - [Worker Layer](#4-worker-layer)
  - [Repository Layer](#5-repository-layer)
  - [Database Layer](#6-database-layer)
  - [Core Layer](#7-core-layer)
  - [Logger](#8-logger)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Job Enqueue Flow](#job-enqueue-flow)
  - [Job Processing Flow](#job-processing-flow)
  - [Retry & DLQ Flow](#retry--dlq-flow)
  - [Graceful Shutdown Flow](#graceful-shutdown-flow)
- [Database Design](#database-design)
  - [Schema](#schema)
  - [State Machine](#state-machine)
  - [Indexing & Query Patterns](#indexing--query-patterns)
- [Concurrency Model](#concurrency-model)
  - [Job Acquisition Strategy](#job-acquisition-strategy)
  - [Worker Coordination](#worker-coordination)
- [Retry & Backoff Strategy](#retry--backoff-strategy)
- [Dead Letter Queue Design](#dead-letter-queue-design)
- [Error Handling Strategy](#error-handling-strategy)
- [Design Patterns Used](#design-patterns-used)
- [Design Decisions & Rationale](#design-decisions--rationale)
- [Limitations & Future Improvements](#limitations--future-improvements)

---

## High-Level Overview

QueueCTL is a **CLI-based background job queue system** that executes shell commands asynchronously with automatic retry, exponential backoff, and a Dead Letter Queue for permanently failed jobs.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         QueueCTL System                            │
│                                                                     │
│   ┌──────────┐     ┌────────────┐     ┌────────────┐               │
│   │   CLI    │────▶│  Services  │────▶│  Workers   │               │
│   │ Commands │     │  (Logic)   │     │ (Executors)│               │
│   └──────────┘     └─────┬──────┘     └─────┬──────┘               │
│                          │                   │                      │
│                    ┌─────▼──────┐      ┌─────▼──────┐              │
│                    │ Repository │      │   Shell    │              │
│                    │  (Data)    │      │  (OS)      │              │
│                    └─────┬──────┘      └────────────┘              │
│                          │                                          │
│                    ┌─────▼──────┐                                   │
│                    │  SQLite    │                                   │
│                    │  Database  │                                   │
│                    └────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Core Principles:**

1. **Separation of Concerns** — Each layer has a single responsibility
2. **Persistence-First** — All state is persisted to SQLite before acknowledgment
3. **Fail-Safe** — Failed jobs are retried automatically; permanently failed jobs are preserved in DLQ
4. **Concurrency-Safe** — Atomic job acquisition prevents duplicate processing

---

## System Architecture

### Layered Architecture

The system follows a **strict layered architecture** where each layer only communicates with the layer directly below it:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   PRESENTATION        src/cli/commands/*                │
│   (CLI Layer)         Commander.js command handlers     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   BUSINESS LOGIC      src/services/*                    │
│   (Service Layer)     JobService, WorkerService,        │
│                       DLQService                        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ORCHESTRATION       src/queue/*                       │
│   (Queue Layer)       QueueManager, RetryManager        │
│                                                         │
│   EXECUTION           src/workers/*                     │
│   (Worker Layer)      Worker (child_process.exec)       │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   DATA ACCESS         src/repository/*                  │
│   (Repository Layer)  JobRepository (SQL abstraction)   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   STORAGE             src/database/*                    │
│   (Database Layer)    SQLite via better-sqlite3         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Module Dependency Graph

```
index.js
├── cli/commands/enqueue.js ──▶ services/JobService.js
├── cli/commands/list.js    ──▶ services/JobService.js
├── cli/commands/show.js    ──▶ services/JobService.js
├── cli/commands/worker.js  ──▶ services/WorkerService.js
├── cli/commands/dlq.js     ──▶ services/DLQService.js
├── cli/commands/status.js  ──▶ services/JobService.js
└── cli/commands/config.js  ──▶ services/ConfigService.js

services/JobService.js      ──▶ repository/JobRepository.js
                            ──▶ models/Job.js

services/WorkerService.js   ──▶ queue/QueueManager.js
                            ──▶ queue/RetryManager.js
                            ──▶ workers/Worker.js
                            ──▶ repository/JobRepository.js

services/DLQService.js      ──▶ repository/JobRepository.js

queue/QueueManager.js       ──▶ repository/JobRepository.js
queue/RetryManager.js       ──▶ repository/JobRepository.js
                            ──▶ core/constants.js

repository/JobRepository.js ──▶ database/database.js

database/database.js        ──▶ better-sqlite3
```

---

## Component Design

### 1. CLI Layer

**Location:** `src/cli/commands/`

The CLI layer uses [Commander.js](https://github.com/tj/commander.js) to define commands, parse arguments, and route to appropriate services.

| File          | Command               | Responsibility                          |
| ------------- | --------------------- | --------------------------------------- |
| `enqueue.js`  | `queuectl enqueue`    | Parse `--id` and `--command`, call JobService |
| `list.js`     | `queuectl list`       | Fetch all jobs, render as table         |
| `show.js`     | `queuectl show`       | Fetch single job by ID, display details |
| `worker.js`   | `queuectl worker start` | Start N workers, register SIGINT handler |
| `dlq.js`      | `queuectl dlq list/retry` | List dead jobs or re-queue a dead job |

**Design Choice:** Each command is a separate module that exports a `Command` instance. The entry point (`index.js`) simply registers all commands with `program.addCommand()`. This keeps commands isolated and easy to add or remove.

---

### 2. Service Layer

**Location:** `src/services/`

Services encapsulate **business logic** and act as the bridge between the CLI and data layers.

#### JobService

```
┌───────────────────────────────────────┐
│            JobService                 │
├───────────────────────────────────────┤
│ + createJob({ id, command })          │
│   → validates input                   │
│   → checks for duplicate ID          │
│   → creates Job model                │
│   → persists via JobRepository       │
│                                       │
│ + getAllJobs()                         │
│   → returns all jobs                  │
│                                       │
│ + getJob(id)                          │
│   → finds by ID or throws error      │
└───────────────────────────────────────┘
```

#### WorkerService

```
┌───────────────────────────────────────┐
│          WorkerService                │
├───────────────────────────────────────┤
│ - running: boolean                    │
│                                       │
│ + start(workerCount)                  │
│   → spawns N concurrent workerLoop() │
│   → uses Promise.all()               │
│                                       │
│ + stop()                              │
│   → sets running = false              │
│   → workers exit after current job    │
│                                       │
│ - process(workerId)                   │
│   → acquires job → executes → update │
│                                       │
│ - workerLoop(workerId)                │
│   → polls every POLLING_INTERVAL ms  │
└───────────────────────────────────────┘
```

#### DLQService

```
┌───────────────────────────────────────┐
│           DLQService                  │
├───────────────────────────────────────┤
│ + list()                              │
│   → returns all jobs with state=dead  │
│                                       │
│ + retry(id)                           │
│   → resets job: state→pending,        │
│     attempts→0, clears error/output   │
└───────────────────────────────────────┘
```

**Design Choice:** All services are exported as **singleton instances** (`export default new XService()`), ensuring a single instance is shared across the application.

---

### 3. Queue Layer

**Location:** `src/queue/`

#### QueueManager

Thin abstraction that delegates to the repository for job acquisition. Acts as the single entry point for "get next job" logic, making it easy to swap in priority-based or other scheduling strategies.

#### RetryManager

Owns the **retry decision logic**:

```
retry(job, error, exitCode)
│
├── attempts >= max_retries?
│   ├── YES → move to DLQ (state = DEAD)
│   └── NO  → calculate backoff delay
│            → set state = PENDING
│            → set next_retry_at = now + delay
```

**Design Choice:** Retry logic is isolated in its own manager, keeping the WorkerService focused on execution and the Repository focused on data access.

---

### 4. Worker Layer

**Location:** `src/workers/`

#### Worker

Executes job commands using Node.js `child_process.exec` (promisified with `util.promisify`):

```
execute(job)
│
├── child_process.exec(job.command)
│   ├── SUCCESS → { success: true,  output: stdout, exit_code: 0    }
│   └── ERROR   → { success: false, output: "",     exit_code: code }
```

**Design Choice:** Using `exec` (not `spawn`) because:
- Commands are simple shell strings (not argument arrays)
- stdout is captured as a string (suitable for short output)
- Shell features (pipes, redirects) work out of the box

---

### 5. Repository Layer

**Location:** `src/repository/`

#### JobRepository

Encapsulates **all SQL queries** behind a clean JavaScript API:

| Method                        | SQL Operation              | Purpose                         |
| ----------------------------- | -------------------------- | ------------------------------- |
| `create(job)`                 | `INSERT INTO jobs`         | Persist a new job               |
| `findById(id)`                | `SELECT * WHERE id = ?`    | Lookup by primary key           |
| `listAll()`                   | `SELECT * ORDER BY created_at` | List all jobs (FIFO)       |
| `acquireNextPendingJob(wid)`  | `SELECT + UPDATE` (transaction) | Atomic job acquisition   |
| `update(id, fields)`          | Dynamic `UPDATE SET ...`   | Partial field update            |
| `listDeadJobs()`              | `SELECT * WHERE state='dead'` | DLQ listing                 |
| `retryDeadJob(id)`            | `UPDATE` (reset fields)    | Re-queue a dead job             |

**Design Choice:** The **Repository Pattern** ensures:
- SQL is never written outside this file
- Swapping the database (e.g., to PostgreSQL) only requires changing this layer
- Business logic in services stays database-agnostic

---

### 6. Database Layer

**Location:** `src/database/`

- Uses `better-sqlite3` for **synchronous**, high-performance SQLite access
- Auto-creates the `jobs` table on import via `CREATE TABLE IF NOT EXISTS`
- Database file (`queuectl.db`) is created in the project root
- Exports a single `db` instance used by the repository

---

### 7. Core Layer

**Location:** `src/core/`

| File           | Exports                                            |
| -------------- | -------------------------------------------------- |
| `constants.js` | `JOB_STATE` enum, `BACKOFF` configuration          |
| `errors.js`    | `AppError`, `ValidationError`, `NotFoundError`     |

---

### 8. Logger

**Location:** `src/logger/`

Winston-based logger with two transports:

| Transport | Output             | Purpose              |
| --------- | ------------------ | -------------------- |
| Console   | Terminal (stdout)   | Real-time feedback   |
| File      | `logs/app.log`      | Persistent audit log |

**Format:** `[YYYY-MM-DD HH:mm:ss] LEVEL : message`

---

## Data Flow Diagrams

### Job Enqueue Flow

```
User                CLI                 JobService          JobRepository       SQLite
 │                   │                      │                    │                 │
 │  enqueue          │                      │                    │                 │
 │  --id X           │                      │                    │                 │
 │  --command Y      │                      │                    │                 │
 │──────────────────▶│                      │                    │                 │
 │                   │  createJob({id,cmd}) │                    │                 │
 │                   │─────────────────────▶│                    │                 │
 │                   │                      │  validate input    │                 │
 │                   │                      │  check duplicates  │                 │
 │                   │                      │  create Job model  │                 │
 │                   │                      │                    │                 │
 │                   │                      │  create(job)       │                 │
 │                   │                      │───────────────────▶│                 │
 │                   │                      │                    │  INSERT INTO    │
 │                   │                      │                    │────────────────▶│
 │                   │                      │                    │  ✅ persisted    │
 │                   │                      │                    │◀────────────────│
 │                   │                      │◀───────────────────│                 │
 │                   │◀─────────────────────│                    │                 │
 │  ✅ Job added     │                      │                    │                 │
 │◀──────────────────│                      │                    │                 │
```

### Job Processing Flow

```
WorkerService       QueueManager        JobRepository       Worker          Shell
 │                      │                    │                 │               │
 │  workerLoop()        │                    │                 │               │
 │  ┌──────────┐        │                    │                 │               │
 │  │ polling  │        │                    │                 │               │
 │  │ every 3s │        │                    │                 │               │
 │  └────┬─────┘        │                    │                 │               │
 │       │              │                    │                 │               │
 │  getNextJob(wid)     │                    │                 │               │
 │─────────────────────▶│                    │                 │               │
 │                      │  acquireNextJob()  │                 │               │
 │                      │───────────────────▶│                 │               │
 │                      │                    │  BEGIN TX        │               │
 │                      │                    │  SELECT pending  │               │
 │                      │                    │  UPDATE → proc.  │               │
 │                      │                    │  COMMIT TX       │               │
 │                      │◀───────────────────│                 │               │
 │◀─────────────────────│  job (locked)      │                 │               │
 │                      │                    │                 │               │
 │  execute(job)        │                    │                 │               │
 │─────────────────────────────────────────────────────────────▶               │
 │                      │                    │                 │  exec(cmd)    │
 │                      │                    │                 │──────────────▶│
 │                      │                    │                 │  stdout/err   │
 │                      │                    │                 │◀──────────────│
 │◀─────────────────────────────────────────────────────────────               │
 │  result              │                    │                 │               │
 │                      │                    │                 │               │
 │  ┌─── success? ───┐  │                    │                 │               │
 │  │ YES: update     │  │                    │                 │               │
 │  │ → COMPLETED     │  │                    │                 │               │
 │  │                 │  │                    │                 │               │
 │  │ NO: retry()     │  │                    │                 │               │
 │  │ → PENDING/DEAD  │  │                    │                 │               │
 │  └─────────────────┘  │                    │                 │               │
```

### Retry & DLQ Flow

```
             Job Fails
                 │
                 ▼
        ┌────────────────┐
        │ RetryManager   │
        │   .retry()     │
        └───────┬────────┘
                │
                ▼
        ┌───────────────┐      YES     ┌──────────────────┐
        │ attempts >=   │─────────────▶│ Move to DLQ      │
        │ max_retries?  │              │ state = DEAD     │
        └───────┬───────┘              │ store error      │
                │ NO                   │ clear locks      │
                ▼                      └──────────────────┘
        ┌──────────────────────┐
        │ Calculate Backoff    │
        │                      │
        │ delay = 5 × 2^(n-1) │
        │                      │
        │ n=1 → 5s             │
        │ n=2 → 10s            │
        │ n=3 → 20s            │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ Set state = PENDING  │
        │ next_retry_at =      │
        │   now + delay        │
        │ Clear locks          │
        └──────────────────────┘
                   │
                   ▼
          Worker picks up job
          after delay elapses
```

### Graceful Shutdown Flow

```
     User presses Ctrl+C
             │
             ▼
     ┌───────────────┐
     │   SIGINT       │
     │   Handler      │
     └───────┬───────┘
             │
             ▼
     ┌───────────────────┐
     │ WorkerService     │
     │   .stop()         │
     │ running = false   │
     └───────┬───────────┘
             │
     ┌───────┴───────────────────────────┐
     │                                   │
     ▼                                   ▼
┌──────────────┐                ┌──────────────┐
│  Worker-1    │                │  Worker-N    │
│              │                │              │
│ Finish       │                │ Finish       │
│ current job  │                │ current job  │
│              │                │              │
│ Exit loop    │                │ Exit loop    │
└──────┬───────┘                └──────┬───────┘
       │                               │
       └───────────┬───────────────────┘
                   │
                   ▼
          ┌────────────────┐
          │  Promise.all() │
          │   resolves     │
          └────────────────┘
                   │
                   ▼
            Process exits
```

---

## Database Design

### Schema

```sql
CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT PRIMARY KEY,
    command     TEXT NOT NULL,
    state       TEXT NOT NULL,
    attempts    INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at INTEGER,
    locked_by   TEXT,
    locked_at   INTEGER,
    output      TEXT,
    error       TEXT,
    exit_code   INTEGER,
    created_at  INTEGER,
    updated_at  INTEGER
);
```

### State Machine

The `state` column follows a well-defined state machine:

```
                    ┌──────────────────────┐
                    │                      │
                    ▼                      │
┌─────────┐   ┌──────────┐   ┌──────────────┐
│ enqueue │──▶│ pending  │──▶│ processing   │
└─────────┘   └──────────┘   └──┬───────┬───┘
                    ▲            │       │
                    │         success  failure
                    │            │       │
                    │            ▼       ▼
                    │   ┌───────────┐  ┌─────────────────┐
                    │   │ completed │  │ retry?           │
                    │   └───────────┘  └──┬──────────┬───┘
                    │                     │          │
                    │              attempts <     attempts >=
                    │              max_retries    max_retries
                    │                     │          │
                    └─────────────────────┘          │
                                                     ▼
                    ┌────────────────────────  ┌──────────┐
                    │   dlq retry              │   dead   │
                    │   (manual)               │  (DLQ)   │
                    └─────────────────────────▶└──────────┘
```

**Valid State Transitions:**

| From         | To          | Trigger                                    |
| ------------ | ----------- | ------------------------------------------ |
| *(new)*      | `pending`   | `queuectl enqueue`                         |
| `pending`    | `processing`| Worker acquires the job                    |
| `processing` | `completed` | Command exits with code 0                  |
| `processing` | `pending`   | Command fails, retries remaining           |
| `processing` | `dead`      | Command fails, retries exhausted           |
| `dead`       | `pending`   | `queuectl dlq retry`                       |

---

### Indexing & Query Patterns

| Query Pattern                           | Frequency | Method                     |
| --------------------------------------- | --------- | -------------------------- |
| Find next pending job (FIFO, retry-aware) | High (polling) | `acquireNextPendingJob()` |
| Find job by ID                          | Medium    | `findById()`               |
| List all jobs                           | Low       | `listAll()`                |
| List dead jobs                          | Low       | `listDeadJobs()`           |

The critical query — `acquireNextPendingJob` — filters on `state = 'pending'` AND `next_retry_at <= now`, ordered by `created_at ASC` (FIFO). SQLite's primary key index on `id` handles lookups efficiently.

---

## Concurrency Model

### Job Acquisition Strategy

The core concurrency challenge is: **How do multiple workers safely claim jobs without double-processing?**

**Solution: SQLite Transactional Locking**

```javascript
acquireNextPendingJob(workerId) {
    const txn = db.transaction(() => {
        // 1. SELECT the oldest eligible pending job
        const job = SELECT * FROM jobs
                    WHERE state = 'pending'
                    AND next_retry_at <= now
                    ORDER BY created_at ASC
                    LIMIT 1;

        // 2. Atomically UPDATE to processing + lock
        UPDATE jobs SET
            state = 'processing',
            locked_by = workerId,
            locked_at = now
        WHERE id = job.id;

        // 3. Return the locked job
        return SELECT * FROM jobs WHERE id = job.id;
    });

    return txn();  // Runs atomically
}
```

**Why this works:**
- `better-sqlite3` uses **serialized mode** — only one transaction runs at a time
- The SELECT + UPDATE is atomic — no window for another worker to grab the same job
- SQLite's write lock ensures mutual exclusion at the database level

### Worker Coordination

```
┌─────────────────────────────────────────────────┐
│              WorkerService.start(3)             │
│                                                  │
│   Promise.all([                                  │
│     workerLoop("worker-1"),  ──▶  Poll → Exec   │
│     workerLoop("worker-2"),  ──▶  Poll → Exec   │
│     workerLoop("worker-3"),  ──▶  Poll → Exec   │
│   ])                                             │
│                                                  │
│   All workers share:                             │
│   - Same SQLite connection (serialized)          │
│   - Same `running` flag (graceful shutdown)      │
│   - Same event loop (cooperative multitasking)   │
└─────────────────────────────────────────────────┘
```

Workers are **cooperative coroutines** on the Node.js event loop. They yield control during:
- `await sleep(POLLING_INTERVAL)` — 3-second poll delay
- `await exec(command)` — command execution

This means multiple workers can be "in-flight" simultaneously, each awaiting their own shell command.

---

## Retry & Backoff Strategy

### Algorithm

**Exponential backoff** with a configurable base delay:

```
delay = BASE_DELAY_SECONDS × 2^(attempts - 1)
```

### Configuration

| Parameter               | Value  | Location                  |
| ----------------------- | ------ | ------------------------- |
| `BASE_DELAY_SECONDS`   | `5`    | `src/core/constants.js`   |
| `DEFAULT_MAX_RETRIES`  | `3`    | `src/config/config.js`    |

### Backoff Schedule (default settings)

```
Attempt 1 fails → wait 5s   (5 × 2⁰)  → retry
Attempt 2 fails → wait 10s  (5 × 2¹)  → retry
Attempt 3 fails → exhausted            → move to DLQ
```

### Implementation Detail

The backoff is enforced via the `next_retry_at` field:

1. On failure, `next_retry_at` is set to `now + delay` (ISO timestamp)
2. Workers only pick up jobs where `next_retry_at <= now`
3. This naturally enforces the delay without sleep/timers — workers simply skip jobs that aren't ready yet

---

## Dead Letter Queue Design

The DLQ is a **virtual queue** — not a separate table or data store.

```
┌──────────────────────────────────────────────┐
│                 jobs table                   │
│                                              │
│  ┌─────────────────────────┐                 │
│  │ state = 'pending'       │  Active Queue   │
│  │ state = 'processing'   │                 │
│  │ state = 'completed'    │                 │
│  └─────────────────────────┘                 │
│                                              │
│  ┌─────────────────────────┐                 │
│  │ state = 'dead'          │  Dead Letter    │
│  │                         │  Queue (DLQ)    │
│  └─────────────────────────┘                 │
└──────────────────────────────────────────────┘
```

**Why a virtual DLQ?**
- **Simplicity:** No schema migration, no foreign keys, no data synchronization
- **Queryability:** Dead jobs retain all their history (attempts, errors, timestamps)
- **Recovery:** Re-queuing is a simple UPDATE, not a cross-table operation
- **Auditability:** The full lifecycle of every job is in one place

**DLQ Recovery Process:**

```
dlq retry --id X
     │
     ▼
UPDATE jobs SET
    state      = 'pending',
    attempts   = 0,           ← Full reset
    error      = NULL,
    output     = NULL,
    exit_code  = NULL,
    locked_by  = NULL,
    locked_at  = NULL,
    next_retry_at = now       ← Immediately available
```

---

## Error Handling Strategy

### Custom Error Hierarchy

```
Error (built-in)
└── AppError (statusCode: 500)
    ├── ValidationError (statusCode: 400)
    │   └── Missing id/command, duplicate job ID
    └── NotFoundError (statusCode: 404)
        └── Job not found by ID
```

### Error Handling by Layer

| Layer      | Strategy                                                  |
| ---------- | --------------------------------------------------------- |
| CLI        | try/catch around service calls; display ❌ with message   |
| Service    | Validate input; throw custom errors for bad state         |
| Worker     | Catch exec failures; delegate to RetryManager             |
| Repository | Let SQLite errors bubble up (constraint violations, etc.) |

### Job Execution Errors

When `child_process.exec` fails:
1. The error message and exit code are captured (not lost)
2. `RetryManager.retry()` decides: retry or DLQ
3. Error details are persisted on the job record for debugging

---

## Design Patterns Used

| Pattern             | Where                 | Purpose                                        |
| ------------------- | --------------------- | ---------------------------------------------- |
| **Repository**      | `JobRepository`       | Abstracts data access behind a clean API       |
| **Singleton**       | All services/managers | Single shared instance across the app          |
| **Command**         | CLI commands          | Each command is an encapsulated action         |
| **State Machine**   | Job states            | Well-defined transitions prevent invalid state |
| **Strategy**        | RetryManager          | Retry logic is swappable (backoff algorithm)   |
| **Template Method** | WorkerService loop    | poll → acquire → execute → handle result       |

---

## Design Decisions & Rationale

### Why SQLite?

| Criterion     | SQLite                                  | Redis / PostgreSQL                     |
| ------------- | --------------------------------------- | -------------------------------------- |
| Setup         | ✅ Zero config, single file              | ❌ External service required            |
| Persistence   | ✅ Built-in, immediate                   | ⚠️ Redis: optional AOF/RDB            |
| Transactions  | ✅ Full ACID                             | ✅ Full ACID (PostgreSQL)              |
| Concurrency   | ⚠️ Single-writer (sufficient for CLI)   | ✅ Multi-writer                        |
| Distribution  | ❌ Single-node only                      | ✅ Multi-node                          |
| Dependencies  | ✅ Embedded (better-sqlite3)             | ❌ External process                    |

**Decision:** SQLite is the right choice for a CLI tool — zero external dependencies, immediate persistence, and ACID transactions are sufficient for single-node operation.

### Why Synchronous SQLite (better-sqlite3)?

- Node.js SQLite bindings (`better-sqlite3`) are **synchronous**, which simplifies code significantly
- No callback/promise overhead for database operations
- SQLite operations are **microsecond-fast** (in-process, no network) — blocking the event loop is negligible
- Workers yield control during `exec()` and `sleep()`, not during DB ops

### Why Polling (not Pub/Sub)?

- **Simplicity:** No message broker infrastructure needed
- **Reliability:** No missed events — polling always catches up
- **Trade-off:** Up to 3-second latency for job pickup (configurable)
- **Suitability:** For a CLI tool processing shell commands, 3-second latency is negligible

### Why In-Process Workers (not Child Processes)?

- Simpler architecture — no IPC, no process management
- Shared SQLite connection with serialized access
- `Promise.all()` for concurrent worker loops is idiomatic Node.js
- **Trade-off:** Workers share one event loop — but since they `await` shell commands, this is not a bottleneck

---

## Limitations & Future Improvements

### Current Limitations

| Limitation                  | Impact                                              |
| --------------------------- | --------------------------------------------------- |
| No job timeout              | Long-running commands block a worker indefinitely   |
| No priority queues          | All jobs are FIFO — no urgency differentiation      |
| No scheduled/delayed jobs   | Jobs run immediately (no `run_at` support)          |
| Single-node only            | Cannot distribute workers across machines           |
| No job output streaming     | Output is captured only after command completes     |
| No web dashboard            | CLI-only interface                                  |

### Potential Future Improvements

1. **Job Timeout Handling** — Kill commands that exceed a configurable duration
2. **Priority Queues** — Add a `priority` field; workers pick highest-priority first
3. **Scheduled Jobs** — Add `run_at` field for deferred execution
4. **Job Output Logging** — Stream stdout/stderr to log files per job
5. **Metrics & Execution Stats** — Track throughput, average execution time, failure rate
6. **Web Dashboard** — Minimal web UI for monitoring queue health
7. **Configuration via CLI** — `queuectl config set max-retries 5` command
8. **Rate Limiting** — Limit concurrent job execution to prevent resource exhaustion

---

*This document describes the architecture as of QueueCTL v1.0.0.*
