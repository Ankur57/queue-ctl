import { Command } from "commander";
import JobService from "../../services/JobService.js";
import JobRepository from "../../repository/JobRepository.js";

const list = new Command("list");

list
  .description("List all jobs")
  .option("--state <state>", "Filter jobs by state (pending, processing, completed, failed, dead)")
  .action((options) => {
    const jobs = options.state
      ? JobRepository.listByState(options.state)
      : JobService.getAllJobs();

    if (jobs.length === 0) {
      console.log(options.state
        ? `\nNo jobs with state '${options.state}'.`
        : "\nNo jobs found."
      );
      return;
    }

    const header = options.state
      ? `\nQueue Jobs (state: ${options.state})`
      : "\nQueue Jobs";

    console.log(header);
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