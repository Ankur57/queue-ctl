import QueueManager from "../queue/QueueManager.js";
import Worker from "../workers/Worker.js";
import JobRepository from "../repository/JobRepository.js";
import { JOB_STATE } from "../core/constants.js";

class WorkerService {

    async start() {

        const workerId =
            `worker-${Date.now()}`;

        const job =
            QueueManager.getNextJob(workerId);

        if (!job) {

            console.log("No pending jobs.");

            return;

        }

        console.log(
            `Processing ${job.id}`
        );

        const result =
            await Worker.execute(job);

        if (result.success) {

            JobRepository.update(job.id, {

                state: JOB_STATE.COMPLETED,

                output: result.output,

                exit_code: result.exitCode,

                updated_at:
                    new Date().toISOString()

            });

            console.log("Completed");

        }

        else {

            JobRepository.update(job.id, {

                state: JOB_STATE.FAILED,

                error: result.error,

                exit_code: result.exitCode,

                updated_at:
                    new Date().toISOString()

            });

            console.log("Failed");

        }

    }

}

export default new WorkerService();