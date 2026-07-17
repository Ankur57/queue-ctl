import ConfigRepository from "../repository/ConfigRepository.js";
import { ValidationError } from "../core/errors.js";

const VALID_KEYS = {
  "max-retries": {
    default: 3,
    type: "number",
    description: "Maximum retry attempts before moving to DLQ",
  },
  "backoff-base": {
    default: 5,
    type: "number",
    description: "Base delay in seconds for exponential backoff",
  },
  "polling-interval": {
    default: 3000,
    type: "number",
    description: "Worker polling interval in milliseconds",
  },
};

class ConfigService {
  get(key) {
    if (!VALID_KEYS[key]) {
      throw new ValidationError(
        `Invalid config key: '${key}'. Valid keys: ${Object.keys(VALID_KEYS).join(", ")}`
      );
    }

    const row = ConfigRepository.get(key);
    const meta = VALID_KEYS[key];

    if (!row) {
      return meta.default;
    }

    return meta.type === "number" ? Number(row) : row;
  }

  set(key, value) {
    if (!VALID_KEYS[key]) {
      throw new ValidationError(
        `Invalid config key: '${key}'. Valid keys: ${Object.keys(VALID_KEYS).join(", ")}`
      );
    }

    const meta = VALID_KEYS[key];

    if (meta.type === "number") {
      const num = Number(value);
      if (isNaN(num) || num <= 0) {
        throw new ValidationError(
          `Value for '${key}' must be a positive number.`
        );
      }
      value = String(num);
    }

    ConfigRepository.set(key, value);
  }

  list() {
    const all = ConfigRepository.getAll();
    const dbValues = {};
    for (const row of all) {
      dbValues[row.key] = row.value;
    }

    return Object.entries(VALID_KEYS).map(([key, meta]) => {
      const raw = dbValues[key];
      const value =
        raw !== undefined
          ? meta.type === "number"
            ? Number(raw)
            : raw
          : meta.default;

      return {
        key,
        value,
        default: meta.default,
        description: meta.description,
      };
    });
  }

  remove(key) {
    if (!VALID_KEYS[key]) {
      throw new ValidationError(
        `Invalid config key: '${key}'. Valid keys: ${Object.keys(VALID_KEYS).join(", ")}`
      );
    }

    ConfigRepository.remove(key);
  }
}

export default new ConfigService();
