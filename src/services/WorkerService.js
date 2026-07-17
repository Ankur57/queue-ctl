import QueueManager from "../queue/QueueManager.js";
import Worker from "../workers/Worker.js";
import JobRepository from "../repository/JobRepository.js";
import { JOB_STATE } from "../core/constants.js";
import RetryManager from "../queue/RetryManager.js";
import { config } from "../config/config.js";
import logger from "../logger/logger.js";

class WorkerService {
  constructor() {
    this.running = true;
  }

  async process(workerId) {
    const job = QueueManager.getNextJob(workerId);

    if (!job) {
      return false;
    }

    logger.info(
    `[${workerId}] Processing ${job.id}`
  );

    const result = await Worker.execute(job);

    if (result.success) {
      JobRepository.update(job.id, {
        state: JOB_STATE.COMPLETED,
        output: result.output,
        exit_code: result.exitCode,
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
      });

      logger.info(
        `[${workerId}] ${job.id} completed`
      );
    } else {
      RetryManager.retry(job, result.error, result.exitCode);
    }

    return true;
  }

async workerLoop(workerId) {
  let waiting = false;

  while (this.running) {
    const processed = await this.process(workerId);

    if (processed) {
      waiting = false;
      continue;
    }

    if (!waiting) {
      console.log(`[${workerId}] Waiting for jobs...`);
      waiting = true;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, config.POLLING_INTERVAL)
    );
  }

  console.log(`[${workerId}] stopped.`);
}

  async start(workerCount = 1) {
    console.log(`Starting ${workerCount} worker(s)...`);

    const workers = [];

    for (let i = 1; i <= workerCount; i++) {
      workers.push(
        this.workerLoop(`worker-${i}`)
      );
    }

    await Promise.all(workers);
  }

  stop() {
    this.running = false;
  }
}

export default new WorkerService();