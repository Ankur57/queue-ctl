import { jest } from '@jest/globals';
import { exec } from 'child_process';
import util from 'util';

// Force in-memory DB for tests
process.env.QUEUECTL_DB_PATH = ':memory:';

import db from '../src/database/database.js';
import JobService from '../src/services/JobService.js';
import WorkerService from '../src/services/WorkerService.js';
import ConfigService from '../src/services/ConfigService.js';
import DLQService from '../src/services/DLQService.js';
import JobRepository from '../src/repository/JobRepository.js';
import { JOB_STATE } from '../src/core/constants.js';

describe('QueueCTL Integration Flow', () => {
  beforeEach(() => {
    // Clear jobs before each test by directly executing SQL
    db.prepare('DELETE FROM jobs').run();
    db.prepare('DELETE FROM config').run();
  });

  test('Basic job completes successfully', async () => {
    // 1. Enqueue Job
    const job = JobService.createJob({ id: 'test-success', command: 'echo Hello' });
    expect(job.state).toBe(JOB_STATE.PENDING);
    
    // 2. Process Job
    // Rather than starting a full worker loop, just process once
    const processed = await WorkerService.process('worker-1');
    expect(processed).toBe(true);

    // 3. Verify Job Completed
    const completedJob = JobService.getJob('test-success');
    expect(completedJob.state).toBe(JOB_STATE.COMPLETED);
    expect(completedJob.output).toBe('Hello');
    expect(completedJob.exit_code).toBe(0);
    expect(completedJob.error).toBeNull();
  });

  test('Failed job retries with backoff and moves to DLQ', async () => {
    // Override max-retries and backoff-base for faster testing
    ConfigService.set('max-retries', '2'); // Will fail on 2nd attempt (attempts >= 2)
    ConfigService.set('backoff-base', '1'); // 1s base

    const job = JobService.createJob({ id: 'test-fail', command: 'invalidcmd12345' });
    
    // Attempt 1 -> fails -> scheduled for retry
    let processed = await WorkerService.process('worker-1');
    expect(processed).toBe(true);
    
    let updatedJob = JobService.getJob('test-fail');
    expect(updatedJob.state).toBe(JOB_STATE.PENDING);
    expect(updatedJob.attempts).toBe(1);
    
    // Try to process immediately - should return false because next_retry_at hasn't passed
    processed = await WorkerService.process('worker-1');
    expect(processed).toBe(false);

    // Simulate time passing by overriding next_retry_at to past
    JobRepository.update('test-fail', { next_retry_at: new Date(Date.now() - 10000).toISOString() });

    // Attempt 2 -> fails -> moves to DLQ
    processed = await WorkerService.process('worker-1');
    expect(processed).toBe(true);
    
    updatedJob = JobService.getJob('test-fail');
    expect(updatedJob.state).toBe(JOB_STATE.DEAD); // Moved to DLQ
    expect(updatedJob.attempts).toBe(2);
    expect(updatedJob.error).not.toBeNull();

    // Verify DLQ list
    const deadJobs = DLQService.list();
    expect(deadJobs.length).toBe(1);
    expect(deadJobs[0].id).toBe('test-fail');

    // DLQ Retry
    DLQService.retry('test-fail');
    updatedJob = JobService.getJob('test-fail');
    expect(updatedJob.state).toBe(JOB_STATE.PENDING);
    expect(updatedJob.attempts).toBe(0); // Reset
  });

  test('List by state and count by state', () => {
    JobService.createJob({ id: 'j1', command: 'echo 1' });
    JobService.createJob({ id: 'j2', command: 'echo 2' });

    // Update one to processing manually to test filters
    JobRepository.update('j2', { state: JOB_STATE.PROCESSING });

    const pendingJobs = JobRepository.listByState(JOB_STATE.PENDING);
    expect(pendingJobs.length).toBe(1);
    expect(pendingJobs[0].id).toBe('j1');

    const processingJobs = JobRepository.listByState(JOB_STATE.PROCESSING);
    expect(processingJobs.length).toBe(1);
    expect(processingJobs[0].id).toBe('j2');

    const counts = JobRepository.countByState();
    const countMap = Object.fromEntries(counts.map(c => [c.state, c.count]));
    
    expect(countMap[JOB_STATE.PENDING]).toBe(1);
    expect(countMap[JOB_STATE.PROCESSING]).toBe(1);
  });
});
