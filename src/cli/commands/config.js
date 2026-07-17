import { Command } from "commander";
import ConfigService from "../../services/ConfigService.js";

const configCmd = new Command("config");

configCmd.description("Manage configuration (retry, backoff, etc.)");

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key, value) => {
    try {
      ConfigService.set(key, value);
      console.log(`\u2705 Config updated: ${key} = ${value}`);
    } catch (error) {
      console.error("\u274c", error.message);
    }
  });

configCmd
  .command("get <key>")
  .description("Get a configuration value")
  .action((key) => {
    try {
      const value = ConfigService.get(key);
      console.log(`${key} = ${value}`);
    } catch (error) {
      console.error("\u274c", error.message);
    }
  });

configCmd
  .command("list")
  .description("List all configuration values")
  .action(() => {
    const configs = ConfigService.list();

    console.log("\n\u2699\ufe0f  Configuration");
    console.log("=".repeat(75));

    console.log(
      "KEY".padEnd(22) +
        "VALUE".padEnd(12) +
        "DEFAULT".padEnd(12) +
        "DESCRIPTION"
    );

    console.log("-".repeat(75));

    configs.forEach((c) => {
      console.log(
        c.key.padEnd(22) +
          String(c.value).padEnd(12) +
          String(c.default).padEnd(12) +
          c.description
      );
    });

    console.log("=".repeat(75));
  });

configCmd
  .command("reset <key>")
  .description("Reset a configuration value to default")
  .action((key) => {
    try {
      ConfigService.remove(key);
      console.log(`\u2705 Config '${key}' reset to default.`);
    } catch (error) {
      console.error("\u274c", error.message);
    }
  });

export default configCmd;
