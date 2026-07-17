import { Command } from "commander";
import JobRepository from "../../repository/JobRepository.js";

const status = new Command("status");

status
  .description("Show summary of all job states & active workers")
  .action(() => {
    const counts = JobRepository.countByState();
    const allJobs = JobRepository.listAll();

    const stateMap = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };

    for (const row of counts) {
      stateMap[row.state] = row.count;
    }

    const total = Object.values(stateMap).reduce((a, b) => a + b, 0);

    console.log("\n\ud83d\udcca Queue Status");
    console.log("=".repeat(40));
    console.log(`  Pending     : ${stateMap.pending}`);
    console.log(`  Processing  : ${stateMap.processing}`);
    console.log(`  Completed   : ${stateMap.completed}`);
    console.log(`  Failed      : ${stateMap.failed}`);
    console.log(`  Dead (DLQ)  : ${stateMap.dead}`);
    console.log("-".repeat(40));
    console.log(`  Total Jobs  : ${total}`);
    console.log("=".repeat(40));

    const activeJobs = allJobs.filter(
      (job) => job.state === "processing"
    );

    console.log("\n\ud83d\udc77 Active Workers");
    console.log("-".repeat(40));

    if (activeJobs.length === 0) {
      console.log("  No active workers.");
    } else {
      activeJobs.forEach((job) => {
        console.log(
          `  ${(job.locked_by ?? "unknown").padEnd(14)} processing ${job.id}`
        );
      });
    }

    console.log("-".repeat(40));
  });

export default status;
