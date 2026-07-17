import { Command } from "commander";
import DLQService from "../../services/DLQService.js";

const dlq = new Command("dlq");

dlq
    .command("list")
    .description("List all dead jobs")
    .action(() => {

        const jobs = DLQService.list();

        console.table(jobs);

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