import { Command } from "commander";
import JobService from "../../services/JobService.js";

const list = new Command("list");

list
  .description("List all jobs")
  .action(() => {
    const jobs = JobService.getAllJobs();

    if (jobs.length === 0) {
      console.log("\nNo jobs found.");
      return;
    }

    console.log("\nQueue Jobs");
    console.log("=".repeat(90));

    console.log(
      "ID".padEnd(15) +
      "STATE".padEnd(15) +
      "ATTEMPTS".padEnd(12) +
      "COMMAND"
    );

    console.log("-".repeat(90));

    jobs.forEach((job) => {
      console.log(
        job.id.padEnd(15) +
        job.state.padEnd(15) +
        String(job.attempts).padEnd(12) +
        job.command
      );
    });

    console.log("=".repeat(90));
  });

export default list;