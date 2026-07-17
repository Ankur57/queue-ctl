import { Command } from "commander";
import WorkerService from "../../services/WorkerService.js";

const worker = new Command("worker");

worker
  .command("start")
  .description("Start a worker")
  .action(async () => {
    try {
      await WorkerService.start();
    } catch (error) {
      console.error(error.message);
    }
  });

export default worker;