import { access, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { UsageLog, UsageStats } from '../../domain/types.js';

export class UsageStorage {
  private usagePath: string;
  private logs: UsageLog[] = [];

  constructor() {
    const configDir = join(homedir(), '.ollama-proxy');
    this.usagePath = join(configDir, 'usage_logs.json');
    this.loadLogs();
  }

  private async loadLogs(): Promise<void> {
    try {
      await access(this.usagePath);
      const data = await readFile(this.usagePath, 'utf-8');
      this.logs = JSON.parse(data);
    } catch {
      this.logs = [];
    }
  }

  private async saveLogs(): Promise<void> {
    try {
      await writeFile(
        this.usagePath,
        JSON.stringify(this.logs, null, 2),
        'utf-8'
      );
    } catch (err) {
      console.error('Failed to save usage logs:', err);
    }
  }

  async addLog(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    const log: UsageLog = {
      timestamp: new Date().toISOString(),
      provider,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };
    this.logs.push(log);
    await this.saveLogs();
  }

  getLogs(): UsageLog[] {
    return this.logs;
  }

  getStatsByProvider(): Record<string, UsageStats> {
    const stats: Record<string, UsageStats> = {};
    for (const log of this.logs) {
      if (!stats[log.provider]) {
        stats[log.provider] = {
          total_input_tokens: 0,
          total_output_tokens: 0,
          count: 0,
        };
      }
      stats[log.provider].total_input_tokens += log.input_tokens;
      stats[log.provider].total_output_tokens += log.output_tokens;
      stats[log.provider].count += 1;
    }
    return stats;
  }

  getStatsByModel(): Record<string, UsageStats> {
    const stats: Record<string, UsageStats> = {};
    for (const log of this.logs) {
      if (!stats[log.model]) {
        stats[log.model] = {
          total_input_tokens: 0,
          total_output_tokens: 0,
          count: 0,
        };
      }
      stats[log.model].total_input_tokens += log.input_tokens;
      stats[log.model].total_output_tokens += log.output_tokens;
      stats[log.model].count += 1;
    }
    return stats;
  }

  getDailyStats(): Record<string, UsageStats> {
    const stats: Record<string, UsageStats> = {};
    for (const log of this.logs) {
      const date = log.timestamp.split('T')[0];
      if (!stats[date]) {
        stats[date] = {
          total_input_tokens: 0,
          total_output_tokens: 0,
          count: 0,
        };
      }
      stats[date].total_input_tokens += log.input_tokens;
      stats[date].total_output_tokens += log.output_tokens;
      stats[date].count += 1;
    }
    return stats;
  }
}
