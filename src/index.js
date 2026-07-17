#!/usr/bin/env node

import { Command } from "commander";

import enqueue from "./cli/commands/enqueue.js";
import list from "./cli/commands/list.js";
import worker from "./cli/commands/worker.js";

const program = new Command();

program
  .name("queuectl")
  .description("CLI Background Job Queue")
  .version("1.0.0");

program.addCommand(enqueue);
program.addCommand(list);
program.addCommand(worker);

program.parse();