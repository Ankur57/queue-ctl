# QueueCTL

A **CLI-based background job queue system** built with **Node.js**. QueueCTL manages background jobs with worker processes, handles retries using exponential backoff, and maintains a **Dead Letter Queue (DLQ)** for permanently failed jobs. All job data is persisted in a local SQLite database, ensuring jobs survive across restarts.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Setup Instructions](#setup-instructions)
- [Usage Examples](#usage-examples)
  - [Enqueue a Job](#1-enqueue-a-job)
  - [List All Jobs](#2-list-all-jobs)
  - [Show Job Details](#3-show-job-details)
  - [Start Workers](#4-start-workers)
  - [Dead Letter Queue](#5-dead-letter-queue-dlq)
- [Architecture Overview](#architecture-overview)
  - [Project Structure](#project-structure)
  - [Layered Architecture](#layered-architecture)
  - [Job Lifecycle](#job-lifecycle)
  - [Job Schema](#job-schema)
  - [Data Persistence](#data-persistence)
  - [Worker Logic](#worker-logic)
  - [Retry & Exponential Backoff](#retry--exponential-backoff)
  - [Dead Letter Queue](#dead-letter-queue)
  - [Concurrency & Locking](#concurrency--locking)
  - [Graceful Shutdown](#graceful-shutdown)
- [Configuration](#configuration)
- [Assumptions & Trade-offs](#assumptions--trade-offs)
- [Testing Instructions](#testing-instructions)

---

## Features

- ✅ **Enqueue & manage** background jobs via CLI
- ✅ **Multiple worker** support with parallel job processing
- ✅ **Retry mechanism** with exponential backoff
- ✅ **Dead Letter Queue** for permanently failed jobs (with manual retry)
- ✅ **Persistent job storage** using SQLite (survives restarts)
- ✅ **Concurrency-safe** job acquisition via SQLite transactions
- ✅ **Graceful shutdown** (finish current job before exiting)
- ✅ **Structured logging** to both console and file (`logs/app.log`)
- ✅ **Clean CLI interface** with help texts for every command

---

## Tech Stack

| Technology       | Purpose                              |
| ---------------- | ------------------------------------ |
| **Node.js**      | Runtime environment                  |
| **Commander.js**  | CLI framework for parsing commands   |
| **better-sqlite3** | SQLite database driver (synchronous) |
| **Winston**       | Structured logging (console + file)  |
| **Jest**          | Unit testing framework               |

---

## Setup Instructions

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/queuectl.git
cd queuectl

# 2. Install dependencies
npm install

# 3. (Optional) Link the CLI globally
npm link
```

> After running `npm link`, you can use `queuectl` as a global command. Otherwise, use `node src/index.js` or `npm start` as a prefix for all commands.

### Quick Start

```bash
# Enqueue a job
node src/index.js enqueue --id job1 --command "echo Hello World"

# Start a worker to process jobs
node src/index.js worker start

# List all jobs
node src/index.js list
```

---

## Usage Examples

### 1. Enqueue a Job

Add a new job to the queue by providing a unique ID and a shell command to execute.

```bash
queuectl enqueue --id job1 --command "echo Hello World"
```

**Output:**

```
✅ Job added to queue:
┌──────────┬──────────────────────────┐
│ (index)  │ Values                   │
├──────────┼──────────────────────────┤
│ id       │ 'job1'                   │
│ command  │ 'echo Hello World'       │
│ state    │ 'pending'                │
│ attempts │ 0                        │
│ ...      │ ...                      │
└──────────┴──────────────────────────┘
```

**More examples:**

```bash
# A job that sleeps for 2 seconds
queuectl enqueue --id job2 --command "sleep 2"

# A job that will fail (invalid command)
queuectl enqueue --id fail1 --command "invalidcommand123"
```

---

### 2. List All Jobs

View all jobs in the system and their current states.

```bash
queuectl list
```

**Output:**

```
┌─────────┬──────────┬────────────┬──────────┬─────────────────────────┐
│ (index) │ ID       │ STATE      │ ATTEMPTS │ COMMAND                 │
├─────────┼──────────┼────────────┼──────────┼─────────────────────────┤
│ 0       │ job1     │ completed  │ 1        │ echo Hello World        │
│ 1       │ job2     │ pending    │ 0        │ sleep 2                 │
│ 2       │ fail1    │ dead       │ 3        │ invalidcommand123       │
└─────────┴──────────┴────────────┴──────────┴─────────────────────────┘
```

---

### 3. Show Job Details

Get detailed information about a specific job.

```bash
queuectl show --id job1
```

**Output:**

```
📄 Job Details:
  ID           : job1
  Command      : echo Hello World
  State        : completed
  Attempts     : 1
  Max Retries  : 3
  Exit Code    : 0
  Locked By    : N/A
  Locked At    : N/A
  Created At   : 2026-07-17T22:03:01.000Z
  Updated At   : 2026-07-17T22:03:06.000Z
  Output       : Hello World
  Error        : N/A
```

---

### 4. Start Workers

Start one or more worker processes to pick up and execute pending jobs.

```bash
# Start a single worker (default)
queuectl worker start

# Start 3 workers in parallel
queuectl worker start --count 3
```

**Output:**

```
🚀 Starting 3 worker(s)...
[worker-1] Waiting for jobs...
[worker-2] Waiting for jobs...
[worker-3] Waiting for jobs...
[worker-1] Processing job1
[worker-1] ✅ job1 completed
```

**Graceful Shutdown:** Press `Ctrl+C` to stop all workers gracefully. Workers will finish their current job before exiting.

```
^C
⏳ Shutting down workers gracefully...
[worker-1] stopped.
[worker-2] stopped.
[worker-3] stopped.
```

---

### 5. Dead Letter Queue (DLQ)

Jobs that fail after exhausting all retries are moved to the Dead Letter Queue.

**List DLQ jobs:**

```bash
queuectl dlq list
```

**Output:**

```
☠️  Dead Letter Queue:
┌─────────┬──────────┬──────────┬─────────────────────────┐
│ (index) │ ID       │ ATTEMPTS │ COMMAND                 │
├─────────┼──────────┼──────────┼─────────────────────────┤
│ 0       │ fail1    │ 3        │ invalidcommand123       │
└─────────┴──────────┴──────────┴─────────────────────────┘
```

**Retry a DLQ job** (resets attempts to 0 and moves back to the queue):

```bash
queuectl dlq retry --id fail1
```

**Output:**

```
✅ Job fail1 has been re-queued from DLQ.
```

---

## Architecture Overview

### Project Structure

```
queuectl/
├── src/
│   ├── index.js                 # Entry point — registers CLI commands
│   ├── cli/
│   │   └── commands/
│   │       ├── enqueue.js       # `queuectl enqueue` command
│   │       ├── list.js          # `queuectl list` command
│   │       ├── show.js          # `queuectl show` command
│   │       ├── worker.js        # `queuectl worker start` command
│   │       └── dlq.js           # `queuectl dlq list/retry` commands
│   ├── config/
│   │   └── config.js            # Centralized configuration
│   ├── core/
│   │   ├── constants.js         # Job states enum & backoff constants
│   │   └── errors.js            # Custom error classes
│   ├── database/
│   │   └── database.js          # SQLite connection & schema setup
│   ├── models/
│   │   └── Job.js               # Job data model
│   ├── repository/
│   │   └── JobRepository.js     # Data access layer (SQL queries)
│   ├── queue/
│   │   ├── QueueManager.js      # Queue orchestration
│   │   ├── RetryManager.js      # Retry logic with exponential backoff
│   │   └── LockManager.js       # Lock management (placeholder)
│   ├── services/
│   │   ├── JobService.js        # Job business logic
│   │   ├── WorkerService.js     # Worker lifecycle management
│   │   └── DLQService.js        # DLQ operations
│   ├── workers/
│   │   └── Worker.js            # Job execution via child_process
│   └── logger/
│       └── logger.js            # Winston logger (console + file)
├── tests/
│   ├── constants.test.js        # Job state constants tests
│   └── jobModel.test.js         # Job model tests
├── package.json
└── .gitignore
```

---

### Layered Architecture

The project follows a **layered architecture** with the **Repository Pattern** to ensure clean separation of concerns:

```
┌────────────────────────────────────────────┐
│              CLI Layer                     │
│   (Commander.js command definitions)       │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│           Service Layer                    │
│  (JobService, WorkerService, DLQService)   │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│     Queue Layer & Worker Layer             │
│  (QueueManager, RetryManager, Worker)      │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│         Repository Layer                   │
│       (JobRepository — SQL queries)        │
└──────────────────┬─────────────────────────┘
                   │
┌──────────────────▼─────────────────────────┐
│         Database Layer                     │
│    (SQLite via better-sqlite3)             │
└────────────────────────────────────────────┘
```

| Layer          | Responsibility                                                    |
| -------------- | ----------------------------------------------------------------- |
| **CLI**        | Parse user input, validate arguments, invoke services             |
| **Service**    | Business logic, validation, orchestration                         |
| **Queue**      | Job scheduling, retry logic, backoff calculations                 |
| **Worker**     | Execute shell commands via `child_process.exec`                   |
| **Repository** | Data access — all SQL queries are encapsulated here               |
| **Database**   | SQLite connection, schema initialization (`CREATE TABLE IF NOT EXISTS`) |

---

### Job Lifecycle

```
                 ┌──────────┐
   enqueue ────▶ │ PENDING  │ ◀──── retry (backoff delay elapsed)
                 └────┬─────┘
                      │ worker picks up job
                      ▼
                 ┌────────────┐
                 │ PROCESSING │
                 └──┬─────┬───┘
                    │     │
           success  │     │  failure
                    ▼     ▼
             ┌──────────┐  ┌─────────────────────┐
             │COMPLETED │  │ PENDING (retry)      │
             └──────────┘  │ with backoff delay   │
                           └─────────┬───────────┘
                                     │
                              retries exhausted
                                     │
                                     ▼
                              ┌──────────┐
                              │   DEAD   │ (Dead Letter Queue)
                              └────┬─────┘
                                   │
                              dlq retry
                                   │
                                   ▼
                              ┌──────────┐
                              │ PENDING  │ (fresh start)
                              └──────────┘
```

| State        | Description                                     |
| ------------ | ----------------------------------------------- |
| `pending`    | Waiting to be picked up by a worker             |
| `processing` | Currently being executed by a worker            |
| `completed`  | Successfully executed                           |
| `failed`     | Failed, but retryable (transitions to pending)  |
| `dead`       | Permanently failed — moved to DLQ               |

---

### Job Schema

Each job contains the following fields:

```json
{
  "id": "unique-job-id",
  "command": "echo 'Hello World'",
  "state": "pending",
  "attempts": 0,
  "max_retries": 3,
  "next_retry_at": "2026-07-17T10:30:00.000Z",
  "locked_by": null,
  "locked_at": null,
  "output": null,
  "error": null,
  "exit_code": null,
  "created_at": "2026-07-17T10:30:00.000Z",
  "updated_at": "2026-07-17T10:30:00.000Z"
}
```

| Field          | Type    | Description                                    |
| -------------- | ------- | ---------------------------------------------- |
| `id`           | TEXT    | User-provided unique job identifier (PK)       |
| `command`      | TEXT    | Shell command to execute                        |
| `state`        | TEXT    | Current job state                               |
| `attempts`     | INTEGER | Number of execution attempts so far             |
| `max_retries`  | INTEGER | Maximum retries before moving to DLQ (default: 3) |
| `next_retry_at`| TEXT    | ISO timestamp — earliest time for next retry    |
| `locked_by`    | TEXT    | Worker ID that holds the processing lock        |
| `locked_at`    | TEXT    | Timestamp when the lock was acquired            |
| `output`       | TEXT    | stdout from successful execution                |
| `error`        | TEXT    | Error message from failed execution             |
| `exit_code`    | INTEGER | Process exit code                               |
| `created_at`   | TEXT    | Job creation timestamp                          |
| `updated_at`   | TEXT    | Last state-change timestamp                     |

---

### Data Persistence

- **Database:** SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (synchronous, zero-config, embedded)
- **File:** `queuectl.db` in the project root (git-ignored)
- **Schema:** Auto-created on startup via `CREATE TABLE IF NOT EXISTS`
- All state changes are persisted immediately (synchronous writes)
- **Jobs survive across restarts** — the database file persists on disk

---

### Worker Logic

1. Workers poll the job queue every **3 seconds** (configurable via `POLLING_INTERVAL`)
2. `QueueManager.getNextJob(workerId)` is called to fetch the next available job
3. `JobRepository.acquireNextPendingJob(workerId)` runs inside a **SQLite transaction**:
   - Selects the oldest `pending` job where `next_retry_at <= now`
   - Atomically updates it to `processing` and sets `locked_by = workerId`
4. `Worker.execute(job)` runs the command via `child_process.exec`
5. **On success:** Job state → `completed`, output and exit code stored
6. **On failure:** `RetryManager.retry()` handles backoff or DLQ escalation

Multiple workers run concurrently via `Promise.all()` and are identified as `worker-1`, `worker-2`, etc.

---

### Retry & Exponential Backoff

When a job fails, the **RetryManager** calculates the next retry delay using exponential backoff:

```
delay = BASE_DELAY_SECONDS × 2^(attempts - 1)
```

With `BASE_DELAY_SECONDS = 5`:

| Attempt | Delay (seconds) | Formula         |
| ------- | --------------- | --------------- |
| 1       | 5s              | 5 × 2⁰ = 5     |
| 2       | 10s             | 5 × 2¹ = 10    |
| 3       | → DLQ           | Exhausted       |

- The job is set back to `pending` with `next_retry_at` set to the future timestamp
- Workers only pick up jobs where `next_retry_at <= now`, so the backoff is enforced naturally
- If `attempts >= max_retries`, the job is moved to the Dead Letter Queue

**Example log output (from `logs/app.log`):**

```
[2026-07-17 22:20:02] INFO  : [worker-1] Processing fail-log
[2026-07-17 22:20:02] WARN  : fail-log scheduled for retry in 5 seconds
[2026-07-17 22:20:08] INFO  : [worker-1] Processing fail-log
[2026-07-17 22:20:08] WARN  : fail-log scheduled for retry in 10 seconds
[2026-07-17 22:20:20] INFO  : [worker-1] Processing fail-log
[2026-07-17 22:20:20] ERROR : fail-log moved to Dead Letter Queue
```

---

### Dead Letter Queue

The DLQ is implemented as a **virtual queue** — jobs in the same `jobs` table with `state = 'dead'`.

- **Entry:** Jobs are moved to DLQ when retry attempts are exhausted (`attempts >= max_retries`)
- **View:** `queuectl dlq list` shows all dead-letter jobs
- **Recovery:** `queuectl dlq retry --id <id>` resets the job (state → `pending`, attempts → 0, clears error/output) giving it a completely fresh start

---

### Concurrency & Locking

- **Atomic job acquisition:** The `acquireNextPendingJob()` method wraps SELECT + UPDATE in a **SQLite transaction**, ensuring only one worker can acquire a given job
- **Lock tracking:** Each processing job records `locked_by` (worker ID) and `locked_at` (timestamp)
- **Lock cleanup:** Locks are cleared when a job completes, fails, or is retried

---

### Graceful Shutdown

1. User presses `Ctrl+C` → `SIGINT` signal is caught
2. Signal handler calls `WorkerService.stop()` → sets `running = false`
3. Each worker loop checks `this.running` at the top of its while loop
4. Workers finish their **current job** (if any) before exiting
5. `Promise.all()` in `start()` resolves when all worker loops complete

This ensures no job is left in a half-processed state.

---

## Configuration

Configuration is centralized in `src/config/config.js`:

| Parameter              | Default | Description                              |
| ---------------------- | ------- | ---------------------------------------- |
| `DATABASE_NAME`        | `queuectl.db` | SQLite database filename           |
| `DEFAULT_MAX_RETRIES`  | `3`     | Max retry attempts per job               |
| `POLLING_INTERVAL`     | `3000`  | Worker polling interval in milliseconds  |
| `BACKOFF.BASE_DELAY_SECONDS` | `5` | Base delay for exponential backoff (seconds) |

---

## Assumptions & Trade-offs

### Assumptions

1. **User-provided job IDs:** Job IDs are supplied by the user at enqueue time (e.g., `--id job1`). This gives the user full control over job identification and enables duplicate detection.
2. **Shell commands:** Jobs execute arbitrary shell commands via `child_process.exec`. The system trusts the user to provide valid, safe commands.
3. **Single-node deployment:** QueueCTL is designed to run on a single machine. All workers are threads within the same Node.js process (using `Promise.all`, not separate OS processes).
4. **Immediate persistence:** SQLite's synchronous API (`better-sqlite3`) ensures all writes are durable immediately without needing to manage async transactions.

### Trade-offs

| Decision                          | Trade-off                                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLite over Redis/PostgreSQL**  | Simpler setup (zero external dependencies, single file). Trade-off: not suitable for distributed/multi-node deployments.               |
| **In-process workers**            | Simplifies architecture — no IPC needed. Trade-off: all workers share one event loop; a very CPU-heavy command could slow others.      |
| **Polling over event-driven**     | Workers poll every 3 seconds for new jobs. Simpler to implement than pub/sub. Trade-off: slight latency (up to 3s) before pickup.      |
| **Virtual DLQ (same table)**      | Single table with state-based filtering keeps the schema simple. Trade-off: very large queues could slow queries (acceptable at scale). |
| **Synchronous SQLite API**        | Simpler code, no callback/promise overhead for DB ops. Trade-off: DB operations block the event loop (negligible for SQLite).          |
| **No job timeout**                | Long-running commands will block a worker indefinitely. Acceptable for an MVP; could be added as a future enhancement.                 |

### Simplifications

- **No authentication/authorization** — the CLI is intended for local, single-user use
- **No distributed locking** — SQLite transactions are sufficient for in-process concurrency
- **No priority queues** — jobs are processed in FIFO order (oldest pending job first)
- **No scheduled/delayed jobs** — jobs are processed as soon as they are enqueued (or after backoff delay)

---

## Testing Instructions

### Running Unit Tests

```bash
npm test
```

This runs Jest with ES Module support. Current test coverage includes:
- **Constants tests** — validates all job states are correctly defined
- **Job model tests** — validates Job constructor assigns fields properly

### Manual Verification Scenarios

The following scenarios can be tested manually to validate core functionality:

#### 1. Basic Job Completes Successfully

```bash
# Enqueue a simple job
node src/index.js enqueue --id test1 --command "echo Hello World"

# Start a worker
node src/index.js worker start

# Verify the job completed
node src/index.js show --id test1
# Expected: state = "completed", output = "Hello World", exit_code = 0
```

#### 2. Failed Job Retries with Backoff and Moves to DLQ

```bash
# Enqueue a job that will always fail
node src/index.js enqueue --id fail1 --command "invalidcommand123"

# Start a worker and observe retry behavior
node src/index.js worker start

# Watch the logs — you will see:
#   fail1 scheduled for retry in 5 seconds
#   fail1 scheduled for retry in 10 seconds
#   fail1 moved to Dead Letter Queue

# Verify the job is in the DLQ
node src/index.js dlq list
# Expected: fail1 appears with state = "dead"
```

#### 3. Multiple Workers Process Jobs Without Overlap

```bash
# Enqueue several jobs
node src/index.js enqueue --id multi1 --command "echo Job 1"
node src/index.js enqueue --id multi2 --command "echo Job 2"
node src/index.js enqueue --id multi3 --command "echo Job 3"

# Start 3 workers
node src/index.js worker start --count 3

# Verify each job was processed by only one worker
node src/index.js list
# Expected: all 3 jobs = "completed", each locked_by a different worker
```

#### 4. Invalid Commands Fail Gracefully

```bash
node src/index.js enqueue --id bad1 --command "nonexistent_command"
node src/index.js worker start
# Worker will catch the error, retry, and eventually move to DLQ
# No crashes — error is logged and stored on the job
```

#### 5. Job Data Survives Restart

```bash
# Enqueue a job
node src/index.js enqueue --id persist1 --command "echo Persistent"

# Kill the process (Ctrl+C)
# Restart and verify the job is still there
node src/index.js list
# Expected: persist1 appears with state = "pending"
```

#### 6. DLQ Retry Works

```bash
# After a job reaches the DLQ, retry it
node src/index.js dlq retry --id fail1
node src/index.js show --id fail1
# Expected: state = "pending", attempts = 0 (reset for fresh start)
```

---

## CLI Command Reference

| Command                              | Description                          |
| ------------------------------------ | ------------------------------------ |
| `queuectl enqueue --id <id> --command <cmd>` | Add a new job to the queue   |
| `queuectl list`                      | List all jobs with their states      |
| `queuectl show --id <id>`           | Show detailed info for a specific job |
| `queuectl worker start [--count N]` | Start N workers (default: 1)         |
| `queuectl dlq list`                 | List all dead-letter jobs            |
| `queuectl dlq retry --id <id>`      | Re-queue a dead job for processing   |

---

## Logging

All operations are logged to both the console and `logs/app.log` using Winston:

```
[2026-07-17 22:03:01] INFO  : Job test100 added to queue
[2026-07-17 22:03:06] INFO  : [worker-1] Processing test100
[2026-07-17 22:03:06] INFO  : [worker-1] test100 completed
```

Log format: `[YYYY-MM-DD HH:mm:ss] LEVEL : message`

---

## License

ISC
