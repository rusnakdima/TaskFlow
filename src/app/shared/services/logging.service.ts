import { Injectable, signal, computed, inject } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'success' | 'off';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
  context?: Record<string, unknown>;
  operationId?: string;
  durationMs?: number;
  data?: unknown;
  error?: unknown;
}

export interface LogFilter {
  level?: LogLevel;
  minLevel?: LogLevel;
  source?: string;
  search?: string;
  since?: Date;
  until?: Date;
  operationId?: string;
}

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration: number;
  createdAt: number;
}

export type ProblemSeverity = 'critical' | 'medium' | 'low';
export type ProblemCategory = 'audio' | 'video' | 'capture' | 'storage' | 'general';

export interface Problem {
  id: string;
  severity: ProblemSeverity;
  category: ProblemCategory;
  message: string;
  occurrenceCount: number;
  firstOccurrence: number;
  lastOccurrence: number;
  resolvedAt?: number;
  resolution?: string;
}

export interface LoggingEnvironment {
  enabled?: boolean;
  minLevel?: LogLevel;
  consoleOutput?: boolean;
  memoryOutput?: boolean;
  fileOutput?: boolean;
  fileLogLevel?: LogLevel;
  levels?: Partial<Record<LogLevel, boolean>>;
  sources?: Record<string, boolean>;
}

export interface LogFileInfo {
  path: string;
  name: string;
  size: number;
  createdAt: Date;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  success: 5,
};

const SENSITIVE_KEYS = [
  'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key', 'accessToken',
  'access_token', 'refreshToken', 'refresh_token', 'auth', 'authorization',
  'credential', 'private', 'key', 'secretKey', 'session', 'cookie', 'csrf',
  'xsrf', 'jwt', 'bearer', 'basic', 'apikey', 'api-key', 'auth-token',
];

const SENSITIVE_PATTERNS = [
  /password/i, /secret/i, /token/i, /key/i, /auth/i, /credential/i,
  /bearer\s+[\w.-]+/i, /basic\s+[\w+=]+/i,
];

const MAX_LOG_ENTRIES = 1000;

@Injectable({ providedIn: 'root' })
export class LoggingService {
  private readonly _logs = signal<LogEntry[]>([]);
  private readonly _enabled = signal<boolean>(true);
  private readonly _minLevel = signal<LogLevel>('debug');
  private readonly _consoleOutput = signal<boolean>(true);
  private readonly _memoryOutput = signal<boolean>(true);
  private readonly _fileOutput = signal<boolean>(false);
  private readonly _fileLogLevel = signal<LogLevel>('error');
  private readonly _operations = signal<Map<string, { startTime: number; context?: Record<string, unknown> }>>(new Map());

  readonly logs = computed(() => this._logs());
  readonly enabled = computed(() => this._enabled());
  readonly minLevel = computed(() => this._minLevel());
  readonly consoleOutput = computed(() => this._consoleOutput());
  readonly memoryOutput = computed(() => this._memoryOutput());
  readonly fileOutput = computed(() => this._fileOutput());
  readonly fileLogLevel = computed(() => this._fileLogLevel());

  readonly errorLogs = computed(() => this._logs().filter(l => l.level === 'error'));
  readonly warnLogs = computed(() => this._logs().filter(l => l.level === 'warn'));
  readonly infoLogs = computed(() => this._logs().filter(l => l.level === 'info'));
  readonly debugLogs = computed(() => this._logs().filter(l => l.level === 'debug'));
  readonly successLogs = computed(() => this._logs().filter(l => l.level === 'success'));
  readonly recentLogs = computed(() => this._logs().slice(-50));

  readonly logContexts = computed(() => {
    const contexts = new Set<string>();
    this._logs().forEach((log) => {
      if (log.context) {
        Object.keys(log.context).forEach(key => contexts.add(key));
      }
    });
    return Array.from(contexts);
  });

  public notifications = signal<Notification[]>([]);

  private _problems = signal<Problem[]>([]);

  public readonly sortedProblems = computed(() => {
    return [...this._problems()].sort((a, b) => {
      const order: Record<ProblemSeverity, number> = { critical: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });
  });

  private operationCounter = 0;
  private tauriApi: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } | null = null;

  constructor() {
    this.initTauriApi();
    this.loadSettings();
    this.applyEnvironmentConfig();
  }

  private initTauriApi(): void {
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __TAURI__?: { core: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } } };
      if (win.__TAURI__) {
        this.tauriApi = win.__TAURI__.core;
      }
    }
  }

  private applyEnvironmentConfig(): void {
    const env = (window as unknown as { __TAURI_ENV__?: LoggingEnvironment }).__TAURI_ENV__;
    if (env) {
      if (typeof env.enabled === 'boolean') this._enabled.set(env.enabled);
      if (env.minLevel) this._minLevel.set(env.minLevel);
      if (typeof env.consoleOutput === 'boolean') this._consoleOutput.set(env.consoleOutput);
      if (typeof env.memoryOutput === 'boolean') this._memoryOutput.set(env.memoryOutput);
      if (typeof env.fileOutput === 'boolean') this._fileOutput.set(env.fileOutput);
      if (env.fileLogLevel) this._fileLogLevel.set(env.fileLogLevel);
    }
  }

  private loadSettings(): void {
    try {
      const saved = localStorage.getItem('logging_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        if (settings.minLevel) this._minLevel.set(settings.minLevel as LogLevel);
        if (typeof settings.enabled === 'boolean') this._enabled.set(settings.enabled);
        if (typeof settings.consoleOutput === 'boolean') this._consoleOutput.set(settings.consoleOutput);
        if (typeof settings.fileOutput === 'boolean') this._fileOutput.set(settings.fileOutput);
        if (settings.fileLogLevel) this._fileLogLevel.set(settings.fileLogLevel as LogLevel);
      }
    } catch {}
  }

  private saveSettings(): void {
    try {
      localStorage.setItem('logging_settings', JSON.stringify({
        minLevel: this._minLevel(),
        enabled: this._enabled(),
        consoleOutput: this._consoleOutput(),
        fileOutput: this._fileOutput(),
        fileLogLevel: this._fileLogLevel(),
      }));
    } catch {}
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this._enabled()) return false;
    if (level === 'off') return false;
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this._minLevel()];
  }

  private shouldLogToFile(level: LogLevel): boolean {
    if (!this._fileOutput()) return false;
    if (level === 'off') return false;
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this._fileLogLevel()];
  }

  private generateId(): string {
    return `${Date.now()}-${++this.operationCounter}`;
  }

  private createTimestamp(): string {
    return new Date().toISOString();
  }

  private formatTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  }

  private sanitizeData(data: unknown, depth = 0): unknown {
    if (depth > 10) return '[MAX_DEPTH]';
    if (data === null || data === undefined) return data;
    if (typeof data === 'string') {
      let sanitized = data;
      for (const pattern of SENSITIVE_PATTERNS) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
      return sanitized;
    }
    if (typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeData(item, depth + 1));
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        result[key] = this.sanitizeData(value, depth + 1);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private createEntry(
    level: LogLevel,
    message: string,
    source?: string,
    context?: Record<string, unknown>,
    operationId?: string,
    durationMs?: number,
    data?: unknown,
    error?: unknown
  ): LogEntry {
    return {
      id: this.generateId(),
      timestamp: this.createTimestamp(),
      level,
      message,
      source: source || this.getDefaultSource(),
      context: context ? this.sanitizeData(context) as Record<string, unknown> : undefined,
      operationId,
      durationMs,
      data: data ? this.sanitizeData(data) : undefined,
      error: error ? this.sanitizeData(error) : undefined,
    };
  }

  private getDefaultSource(): string {
    return 'app';
  }

  private formatLogForFile(entry: LogEntry): string {
    const timestamp = this.formatTimestamp();
    const level = entry.level.toUpperCase().padEnd(5);
    const source = (entry.source || 'app').padEnd(20);
    let result = `[${timestamp}] [${level}] [${source}] ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      const contextStr = Object.entries(entry.context)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      result += ` | context: {${contextStr}}`;
    }

    if (entry.durationMs !== undefined) {
      result += ` | duration: ${entry.durationMs}ms`;
    }

    if (entry.data !== undefined) {
      result += ` | data: ${JSON.stringify(entry.data)}`;
    }

    if (entry.error !== undefined) {
      const err = entry.error as { message?: string; stack?: string };
      result += ` | error: ${err.message || String(entry.error)}`;
      if (err.stack) {
        result += `\n  Stack: ${err.stack.split('\n').join('\n  ')}`;
      }
    }

    return result;
  }

  private addLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    if (this._consoleOutput()) {
      const prefix = `[${entry.source?.toUpperCase() || 'APP'}]`;
      const msg = `${prefix} [${entry.level.toUpperCase()}] ${entry.message}`;
      switch (entry.level) {
        case 'error':
        case 'warn':
          console.warn(msg, entry.context || '', entry.data || '');
          break;
        case 'debug':
          console.debug(msg, entry.context || '', entry.data || '');
          break;
        default:
          console.log(msg, entry.context || '', entry.data || '');
      }
    }

    if (this._memoryOutput()) {
      this._logs.update(logs => {
        const updated = [...logs, entry];
        if (updated.length > MAX_LOG_ENTRIES) {
          return updated.slice(-MAX_LOG_ENTRIES);
        }
        return updated;
      });
    }

    if (this.shouldLogToFile(entry.level)) {
      this.writeToFile(entry);
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.tauriApi) {
      this.initTauriApi();
      if (!this.tauriApi) return;
    }

    try {
      const logLine = this.formatLogForFile(entry);
      await this.tauriApi.invoke('write_log_to_file', {
        level: entry.level,
        message: logLine,
        source: entry.source || 'app',
      });
    } catch {
      // Silently fail - don't break app flow
    }
  }

  async getLogFileInfo(): Promise<LogFileInfo | null> {
    if (!this.tauriApi) {
      this.initTauriApi();
      if (!this.tauriApi) return null;
    }

    try {
      const info = await this.tauriApi.invoke('get_log_file_info') as { path: string; name: string; size: number; createdAt: string };
      return {
        ...info,
        createdAt: new Date(info.createdAt),
      };
    } catch {
      return null;
    }
  }

  debug(message: string, context?: Record<string, unknown>, data?: unknown): void {
    this.addLog(this.createEntry('debug', message, undefined, context, undefined, undefined, data));
  }

  info(message: string, context?: Record<string, unknown>, data?: unknown): void {
    this.addLog(this.createEntry('info', message, undefined, context, undefined, undefined, data));
  }

  warn(message: string, context?: Record<string, unknown>, data?: unknown): void {
    this.addLog(this.createEntry('warn', message, undefined, context, undefined, undefined, data));
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    this.addLog(this.createEntry('error', message, undefined, context, undefined, undefined, undefined, error));
  }

  success(message: string, context?: Record<string, unknown>, data?: unknown): void {
    this.addLog(this.createEntry('success', message, undefined, context, undefined, undefined, data));
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>, data?: unknown): void {
    if (level === 'off' || !this.shouldLog(level)) return;
    this.addLog(this.createEntry(level, message, undefined, context, undefined, undefined, data));
  }

  logApiCall(operationId: string, endpoint: string, params?: Record<string, unknown>): void {
    this.addLog(this.createEntry('debug', `API Call: ${endpoint}`, 'api', { endpoint, params }, operationId));
  }

  logApiResponse(operationId: string, endpoint: string, status: number, durationMs: number, data?: unknown): void {
    const level: LogLevel = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'debug';
    this.addLog(this.createEntry(level, `API Response: ${endpoint} (${status})`, 'api', { endpoint, status, durationMs }, operationId, durationMs, data));
  }

  logServiceEntry(service: string, method: string, context?: Record<string, unknown>): string {
    const operationId = this.generateId();
    this.addLog(this.createEntry('debug', `${service}.${method}() - entry`, service, context, operationId));
    return operationId;
  }

  logServiceExit(service: string, method: string, operationId: string, durationMs: number, result?: unknown): void {
    this.addLog(this.createEntry('debug', `${service}.${method}() - exit`, service, { durationMs }, operationId, durationMs, result));
  }

  logComponentAction(component: string, action: string, data?: unknown): void {
    this.addLog(this.createEntry('debug', `${component}: ${action}`, 'component', undefined, undefined, undefined, data));
  }

  logUserAction(action: string, data?: Record<string, unknown>): void {
    this.addLog(this.createEntry('info', `User: ${action}`, 'user', data));
  }

  logStateChange(source: string, property: string, oldValue: unknown, newValue: unknown): void {
    this.addLog(this.createEntry('debug', `State: ${source}.${property}`, 'store', { oldValue, newValue }));
  }

  startOperation(name: string, context?: Record<string, unknown>): string {
    const operationId = this.generateId();
    this._operations.update(ops => {
      const updated = new Map(ops);
      updated.set(operationId, { startTime: performance.now(), context });
      return updated;
    });
    this.addLog(this.createEntry('debug', `Operation started: ${name}`, 'operation', context, operationId));
    return operationId;
  }

  completeOperation(name: string, operationId: string, success = true, data?: unknown): void {
    const op = this._operations().get(operationId);
    const durationMs = op ? performance.now() - op.startTime : 0;
    this._operations.update(ops => {
      const updated = new Map(ops);
      updated.delete(operationId);
      return updated;
    });
    this.addLog(this.createEntry(
      success ? 'debug' : 'error',
      `Operation ${success ? 'completed' : 'failed'}: ${name}`,
      'operation',
      op?.context,
      operationId,
      durationMs,
      data
    ));
  }

  getLogs(filter?: LogFilter): LogEntry[] {
    let logs = this._logs();
    if (!filter) return logs;

    if (filter.minLevel) {
      logs = logs.filter(l => LOG_LEVEL_PRIORITY[l.level] <= LOG_LEVEL_PRIORITY[filter.minLevel!]);
    }
    if (filter.level) {
      logs = logs.filter(l => l.level === filter.level);
    }
    if (filter.source) {
      logs = logs.filter(l => l.source === filter.source);
    }
    if (filter.operationId) {
      logs = logs.filter(l => l.operationId === filter.operationId);
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      logs = logs.filter(l =>
        l.message.toLowerCase().includes(search) ||
        l.source?.toLowerCase().includes(search)
      );
    }
    if (filter.since) {
      logs = logs.filter(l => new Date(l.timestamp) >= filter.since!);
    }
    if (filter.until) {
      logs = logs.filter(l => new Date(l.timestamp) <= filter.until!);
    }
    return logs;
  }

  getRecentLogs(count = 50): LogEntry[] {
    return this._logs().slice(-count);
  }

  getLogStats(): { total: number; byLevel: Record<LogLevel, number>; bySource: Record<string, number> } {
    const logs = this._logs();
    const byLevel: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0, success: 0, off: 0 };
    const bySource: Record<string, number> = {};

    for (const log of logs) {
      byLevel[log.level]++;
      if (log.source) {
        bySource[log.source] = (bySource[log.source] || 0) + 1;
      }
    }

    return { total: logs.length, byLevel, bySource };
  }

  getLogsForExport(format: 'json' | 'csv' | 'txt' = 'json'): string {
    const logs = this._logs();
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    if (format === 'txt') {
      return logs.map(entry => this.formatLogForFile(entry)).join('\n');
    }

    const headers = ['id', 'timestamp', 'level', 'message', 'source', 'operationId', 'durationMs'];
    const csvRows = [headers.join(',')];
    for (const log of logs) {
      csvRows.push([
        log.id,
        log.timestamp,
        log.level,
        `"${log.message.replace(/"/g, '""')}"`,
        log.source || '',
        log.operationId || '',
        log.durationMs?.toString() || '',
      ].join(','));
    }
    return csvRows.join('\n');
  }

  exportLogs(filename = 'logs', format: 'json' | 'csv' | 'txt' = 'json'): void {
    const content = this.getLogsForExport(format);
    const mimeTypes: Record<string, string> = {
      json: 'application/json',
      csv: 'text/csv',
      txt: 'text/plain',
    };
    const blob = new Blob([content], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    this.saveSettings();
  }

  setMinLevel(level: LogLevel): void {
    this._minLevel.set(level);
    this.saveSettings();
  }

  setConsoleOutput(enabled: boolean): void {
    this._consoleOutput.set(enabled);
    this.saveSettings();
  }

  setMemoryOutput(enabled: boolean): void {
    this._memoryOutput.set(enabled);
    this.saveSettings();
  }

  setFileOutput(enabled: boolean): void {
    this._fileOutput.set(enabled);
    this.saveSettings();
  }

  setFileLogLevel(level: LogLevel): void {
    this._fileLogLevel.set(level);
    this.saveSettings();
  }

  clearLogs(): void {
    this._logs.set([]);
  }

  clearOperations(): void {
    this._operations.set(new Map());
  }

  showNotification(message: string, type: NotificationType = 'info', duration: number = 5000): void {
    const id = Math.random().toString(36).substring(2, 9);
    const notification: Notification = {
      id,
      message,
      type,
      duration,
      createdAt: Date.now(),
    };

    this.notifications.update((prev) => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(id);
      }, duration);
    }
  }

  removeNotification(id: string): void {
    this.notifications.update((prev) => prev.filter((n) => n.id !== id));
  }

  resolveProblem(id: string, resolution: string): void {
    this._problems.update((prev) =>
      prev.map((p) => (p.id === id ? { ...p, resolvedAt: Date.now(), resolution } : p))
    );
  }

  addProblem(problem: Omit<Problem, 'id' | 'occurrenceCount' | 'firstOccurrence' | 'lastOccurrence'>): void {
    const id = `problem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();
    this._problems.update(prev => [...prev, {
      ...problem,
      id,
      occurrenceCount: 1,
      firstOccurrence: now,
      lastOccurrence: now,
    }]);
  }

  incrementProblemOccurrence(id: string): void {
    this._problems.update(prev =>
      prev.map(p => p.id === id ? { ...p, occurrenceCount: p.occurrenceCount + 1, lastOccurrence: Date.now() } : p)
    );
  }

  getProblemsSummary(): { total: number; critical: number; medium: number; low: number; byContext: Record<string, number> } {
    const problems = this._problems();
    const active = problems.filter(p => !p.resolvedAt);
    const byContext: Record<string, number> = {};
    active.forEach(p => {
      byContext[p.category] = (byContext[p.category] || 0) + 1;
    });
    return {
      total: active.length,
      critical: active.filter(p => p.severity === 'critical').length,
      medium: active.filter(p => p.severity === 'medium').length,
      low: active.filter(p => p.severity === 'low').length,
      byContext,
    };
  }

  shareLogs(): string {
    const stats = this.getLogStats();
    const problems = this.getProblemsSummary();
    return `Logging Stats:
- Total Logs: ${stats.total}
- By Level: debug=${stats.byLevel.debug}, info=${stats.byLevel.info}, warn=${stats.byLevel.warn}, error=${stats.byLevel.error}, success=${stats.byLevel.success}
- Active Problems: ${problems.total} (critical: ${problems.critical}, medium: ${problems.medium}, low: ${problems.low})`;
  }
}
