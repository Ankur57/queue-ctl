import { Command } from "commander";
import DLQService from "../../services/DLQService.js";

const dlq = new Command("dlq");

dlq
    .command("list")
    .description("List all dead jobs")
    .action(() => {

        const jobs = DLQService.list();

        if (jobs.length === 0) {
    console.log("Dead Letter Queue is empty.");
    return;
}

console.log("\nDead Letter Queue");
console.log("=".repeat(80));

console.log(
    "ID".padEnd(20) +
    "ATTEMPTS".padEnd(12) +
    "COMMAND"
);

console.log("-".repeat(80));

jobs.forEach(job => {
    console.log(
        job.id.padEnd(20) +
        String(job.attempts).padEnd(12) +
        job.command
    );
});

console.log("=".repeat(80));

    });

dlq
    .command("retry")
    .requiredOption("--id <id>")
    .description("Retry a dead job")
    .action((options) => {

        DLQService.retry(options.id);

        console.log(`✅ ${options.id} moved back to queue.`);

    });

export default dlq;