import db from "../database/database.js";

class JobRepository {
  create(job) {
    const stmt = db.prepare(`
      INSERT INTO jobs (
        id,
        command,
        state,
        attempts,
        max_retries,
        next_retry_at,
        locked_by,
        locked_at,
        output,
        error,
        exit_code,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @command,
        @state,
        @attempts,
        @max_retries,
        @next_retry_at,
        @locked_by,
        @locked_at,
        @output,
        @error,
        @exit_code,
        @created_at,
        @updated_at
      )
    `);

    stmt.run({
      id: job.id,
      command: job.command,
      state: job.state,
      attempts: job.attempts,
      max_retries: job.max_retries,
      next_retry_at: job.next_retry_at,
      locked_by: job.locked_by,
      locked_at: job.locked_at,
      output: job.output,
      error: job.error,
      exit_code: job.exit_code,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  }

  findById(id) {
    return db.prepare(
      "SELECT * FROM jobs WHERE id = ?"
    ).get(id);
  }

  listAll() {
    return db.prepare(`
      SELECT *
      FROM jobs
      ORDER BY created_at ASC
    `).all();
  }

  acquireNextPendingJob(workerId) {
    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      const job = db.prepare(`
        SELECT *
        FROM jobs
        WHERE
          state = 'pending'
          AND next_retry_at <= ?
        ORDER BY created_at ASC
        LIMIT 1
      `).get(now);

      if (!job) {
        return null;
      }

      db.prepare(`
        UPDATE jobs
        SET
          state = 'processing',
          locked_by = ?,
          locked_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        workerId,
        now,
        now,
        job.id
      );

      return db.prepare(`
        SELECT *
        FROM jobs
        WHERE id = ?
      `).get(job.id);
    });

    return transaction();
  }

  update(id, fields) {
    const query = Object.keys(fields)
      .map((key) => `${key}=@${key}`)
      .join(",");

    db.prepare(`
      UPDATE jobs
      SET ${query}
      WHERE id=@id
    `).run({
      id,
      ...fields,
    });
  }

  listDeadJobs() {
    return db.prepare(`
      SELECT *
      FROM jobs
      WHERE state = 'dead'
      ORDER BY updated_at DESC
    `).all();
  }

  retryDeadJob(id) {
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE jobs
      SET
        state = 'pending',
        attempts = 0,
        error = NULL,
        output = NULL,
        exit_code = NULL,
        locked_by = NULL,
        locked_at = NULL,
        next_retry_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      now,
      now,
      id
    );
  }
}

export default new JobRepository();