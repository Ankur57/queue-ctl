import QueueManager from "../queue/QueueManager.js";
import Worker from "../workers/Worker.js";
import JobRepository from "../repository/JobRepository.js";
import { JOB_STATE } from "../core/constants.js";
import RetryManager from "../queue/RetryManager.js";

class WorkerService {
  async start() {
    const workerId = `worker-${Date.now()}`;

    const job = QueueManager.getNextJob(workerId);

    if (!job) {
      console.log("No pending jobs.");
      return;
    }

    console.log(`Processing ${job.id}`);

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

      console.log(`✅ ${job.id} completed successfully.`);
    } else {
      RetryManager.retry(
        job,
        result.error,
        result.exitCode
      );
    }
  }
}

export default new WorkerService();