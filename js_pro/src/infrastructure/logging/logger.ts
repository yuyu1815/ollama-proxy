import type { ConfigManager } from '../config/manager.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logLevelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const getLoggerMethod = (level: LogLevel) => {
  if (level === 'error') return console.error.bind(console);
  if (level === 'warn') return console.warn.bind(console);
  if (level === 'info') return console.info.bind(console);
  return console.debug
    ? console.debug.bind(console)
    : console.log.bind(console);
};

const formatMeta = (meta?: Record<string, unknown>) => {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ` ${JSON.stringify(meta)}`;
};

export const logWithLevel = (
  configManager: ConfigManager,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) => {
  const currentLevel = configManager.getServerConfig().log_level;
  if (logLevelOrder[level] < logLevelOrder[currentLevel]) {
    return;
  }

  const timestamp = new Date().toISOString();
  const logger = getLoggerMethod(level);
  logger(
    `[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`
  );
};