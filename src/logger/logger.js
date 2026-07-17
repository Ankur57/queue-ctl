import fs from "fs";
import path from "path";
import winston from "winston";

const logDirectory = path.join(process.cwd(), "logs");

if (!fs.existsSync(logDirectory)) {
  fs.mkdirSync(logDirectory, { recursive: true });
}

const logger = winston.createLogger({
  level: "info",

  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()} : ${message}`;
    })
  ),

  transports: [
    new winston.transports.Console(),

    new winston.transports.File({
      filename: path.join(logDirectory, "app.log"),
    }),
  ],
});

export default logger;