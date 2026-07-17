import { Command } from "commander";
import JobService from "../../services/JobService.js";

const list = new Command("list");

list.description("List all jobs");

list.action(() => {
  const jobs = JobService.getAllJobs();

  console.table(jobs);
});

export default list;