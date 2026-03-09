import winston from 'winston'

const { combine, timestamp, colorize, printf, json } = winston.format

const devFormat = printf(({ level, message, service, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
  return `${timestamp} [${service}] ${level}: ${message}${metaStr}`
})

export function createLogger(service: string) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    defaultMeta: { service },
    format:
      process.env.NODE_ENV === 'production'
        ? combine(timestamp(), json())
        : combine(timestamp({ format: 'HH:mm:ss' }), colorize(), devFormat),
    transports: [new winston.transports.Console()],
  })
}
