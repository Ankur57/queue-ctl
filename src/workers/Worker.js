import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

class Worker {
  async execute(job) {
    try {
      const { stdout } = await execAsync(job.command);

      return {
        success: true,
        output: stdout.trim(),
        exit_code: 0,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        output: "",
        exit_code: err.code || 1,
        error: err.message,
      };
    }
  }
}

export default new Worker();