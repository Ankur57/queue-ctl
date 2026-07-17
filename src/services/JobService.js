import JobRepository from "../repository/JobRepository.js";
import Job from "../models/Job.js";
import { JOB_STATE } from "../core/constants.js";
import { config } from "../config/config.js";
import { ValidationError } from "../core/errors.js";

class JobService {
  createJob({ id, command }) {
    if (!id || !command) {
      throw new ValidationError("Job id and command are required.");
    }

    const existingJob = JobRepository.findById(id);

    if (existingJob) {
      throw new ValidationError("Job ID already exists.");
    }

    const now = new Date().toISOString();

    const job = new Job({
      id,
      command,
      state: JOB_STATE.PENDING,
      attempts: 0,
      max_retries: config.DEFAULT_MAX_RETRIES,
      next_retry_at: now,
      created_at: now,
      updated_at: now,
    });

    JobRepository.create(job);

    return job;
  }

  getAllJobs() {
    return JobRepository.listAll();
  }
}

export default new JobService();