import { Command } from "commander";
import JobService from "../../services/JobService.js";

const show = new Command("show");

show
  .description("Show detailed information about a job")
  .requiredOption("--id <id>", "Job ID")
  .action((options) => {
    try {
      const job = JobService.getJob(options.id);

      console.log("\n==========================================");
      console.log("           JOB DETAILS");
      console.log("==========================================");
      console.log(`ID           : ${job.id}`);
      console.log(`Command      : ${job.command}`);
      console.log(`State        : ${job.state}`);
      console.log(`Attempts     : ${job.attempts}`);
      console.log(`Max Retries  : ${job.max_retries}`);
      console.log(`Exit Code    : ${job.exit_code ?? "N/A"}`);
      console.log(`Locked By    : ${job.locked_by ?? "N/A"}`);
      console.log(`Locked At    : ${job.locked_at ?? "N/A"}`);
      console.log(`Created At   : ${job.created_at}`);
      console.log(`Updated At   : ${job.updated_at}`);

      console.log("\nOutput:");
      console.log("------------------------------------------");
      console.log(job.output ?? "N/A");

      console.log("\nError:");
      console.log("------------------------------------------");
      console.log(job.error ?? "N/A");

      console.log("==========================================");
    } catch (error) {
      console.error("❌", error.message);
    }
  });

export default show;