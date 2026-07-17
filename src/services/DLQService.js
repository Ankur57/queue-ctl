import JobRepository from "../repository/JobRepository.js";

class DLQService {

    list() {
        return JobRepository.listDeadJobs();
    }

    retry(id) {
        JobRepository.retryDeadJob(id);
    }

}

export default new DLQService();