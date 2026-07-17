import { Command } from "commander";
import WorkerService from "../../services/WorkerService.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PID_FILE = path.join(process.cwd(), ".queuectl.pid");

const worker = new Command("worker");

worker
  .command("start")
  .description("Start worker(s) to process jobs")
  .option(
    "-c, --count <count>",
    "Number of workers",
    "1"
  )
  .action(async (options) => {
    const count = parseInt(options.count, 10);

    // Write PID file so `worker stop` can find this process
    fs.writeFileSync(PID_FILE, process.pid.toString());

    const cleanup = () => {
      try {
        fs.unlinkSync(PID_FILE);
      } catch {
        // Ignore if already deleted
      }
    };

    process.on("SIGINT", () => {
      console.log("\n⏳ Shutting down workers gracefully...");
      WorkerService.stop();
      cleanup();
    });

    process.on("SIGTERM", () => {
      console.log("\n⏳ Shutting down workers gracefully...");
      WorkerService.stop();
      cleanup();
    });

    process.on("exit", cleanup);

    await WorkerService.start(count);
  });

worker
  .command("stop")
  .description("Stop running workers gracefully")
  .action(() => {
    if (!fs.existsSync(PID_FILE)) {
      console.log("❌ No running workers found.");
      return;
    }

    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
      process.kill(pid, "SIGTERM");
      console.log(`✅ Stop signal sent to worker process (PID: ${pid}).`);
    } catch (err) {
      if (err.code === "ESRCH") {
        console.log("⚠️  Worker process not found. Cleaning up stale PID file.");
        try {
          fs.unlinkSync(PID_FILE);
        } catch {
          // Ignore
        }
      } else {
        console.error("❌", err.message);
      }
    }
  });

export default worker;