#!/usr/bin/env node

import { Command } from "commander";

import enqueue from "./cli/commands/enqueue.js";
import list from "./cli/commands/list.js";
import worker from "./cli/commands/worker.js";
import dlq from "./cli/commands/dlq.js";
import show from "./cli/commands/show.js";
import status from "./cli/commands/status.js";
import configCmd from "./cli/commands/config.js";

const program = new Command();

program
  .name("queuectl")
  .description("CLI Background Job Queue")
  .version("1.0.0");

program.addCommand(enqueue);
program.addCommand(list);
program.addCommand(worker);
program.addCommand(dlq);
program.addCommand(show);
program.addCommand(status);
program.addCommand(configCmd);

program.parse();