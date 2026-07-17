import JobRepository from "../repository/JobRepository.js";

class QueueManager {
  getNextJob(workerId) {
    const job = JobRepository.acquireNextPendingJob(workerId);

    if (!job) return null;

    return job;
  }
}

export default new QueueManager();