import { Command } from "commander";
import JobService from "../../services/JobService.js";

const enqueue = new Command("enqueue");

enqueue
  .description("Add a new job to the queue")
  .requiredOption("--id <id>", "Job ID")
  .requiredOption("--command <command>", "Command to execute")
  .action((options) => {
    try {
      const job = JobService.createJob({
        id: options.id,
        command: options.command,
      });

      console.log("✅ Job Added Successfully");
      console.table(job);
    } catch (error) {
      console.error("❌", error.message);
    }
  });

export default enqueue;