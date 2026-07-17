export default class Job {
  constructor({
    id,
    command,
    state,
    attempts = 0,
    max_retries = 3,
    next_retry_at,
    locked_by = null,
    locked_at = null,
    output = null,
    error = null,
    exit_code = null,
    created_at,
    updated_at,
  }) {
    this.id = id;
    this.command = command;
    this.state = state;
    this.attempts = attempts;
    this.max_retries = max_retries;
    this.next_retry_at = next_retry_at;
    this.locked_by = locked_by;
    this.locked_at = locked_at;
    this.output = output;
    this.error = error;
    this.exit_code = exit_code;
    this.created_at = created_at;
    this.updated_at = updated_at;
  }
}