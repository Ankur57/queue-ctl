import { JOB_STATE } from "../src/core/constants.js";

describe("Job States", () => {
  test("should contain all valid states", () => {
    expect(JOB_STATE.PENDING).toBe("pending");
    expect(JOB_STATE.PROCESSING).toBe("processing");
    expect(JOB_STATE.COMPLETED).toBe("completed");
    expect(JOB_STATE.FAILED).toBe("failed");
    expect(JOB_STATE.DEAD).toBe("dead");
  });
});