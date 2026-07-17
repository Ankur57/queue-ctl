import Job from "../src/models/Job.js";

describe("Job Model", () => {
  test("should create a job object", () => {
    const job = new Job({
      id: "job1",
      command: "echo Hello",
      state: "pending",
    });

    expect(job.id).toBe("job1");
    expect(job.command).toBe("echo Hello");
    expect(job.state).toBe("pending");
  });
});