import { Command } from "commander";
import WorkerService from "../../services/WorkerService.js";

const worker = new Command("worker");

worker
  .command("start")
  .description("Start worker(s)")
  .option(
    "-c, --count <count>",
    "Number of workers",
    "1"
  )
  .action(async (options) => {
    const count = parseInt(options.count, 10);

    process.on("SIGINT", () => {
      console.log("\nStopping workers...");
      WorkerService.stop();
    });

    await WorkerService.start(count);
  });

export default worker;