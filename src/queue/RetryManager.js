import JobRepository from "../repository/JobRepository.js";
import { JOB_STATE, BACKOFF } from "../core/constants.js";

class RetryManager {
  retry(job, error, exitCode) {
    const attempts = job.attempts + 1;

    // Move to Dead Letter Queue
    if (attempts >= job.max_retries) {
      JobRepository.update(job.id, {
        state: JOB_STATE.DEAD,
        attempts,
        error,
        exit_code: exitCode,
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
      });

      console.log(`❌ ${job.id} moved to Dead Letter Queue`);

      return;
    }

    const delay =
      BACKOFF.BASE_DELAY_SECONDS *
      Math.pow(2, attempts - 1);

    const retryAt = new Date(
      Date.now() + delay * 1000
    ).toISOString();

    JobRepository.update(job.id, {
      state: JOB_STATE.PENDING,
      attempts,
      next_retry_at: retryAt,
      error,
      exit_code: exitCode,
      locked_by: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    });

    console.log(
      `🔄 ${job.id} scheduled for retry in ${delay} seconds`
    );
  }
}

export default new RetryManager();