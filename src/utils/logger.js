const { createLogger, format, transports } = require('winston');
const { LOG_FILE } = require('../config/constants');

function initializeLogger(options = {}) {
    const { customLogger, enableLogging } = options;

    if (customLogger) {
        return customLogger;
    }

    const isDevelopment = process.env.NODE_ENV !== 'production';

    const loggerTransports = [];

    if (isDevelopment || enableLogging) {
        loggerTransports.push(new transports.Console());

        if (isDevelopment) {
            loggerTransports.push(new transports.File({ filename: LOG_FILE }));
        }
    }

    if (!isDevelopment && !enableLogging) {
        loggerTransports.push(new transports.Console({
            silent: true,
        }));
    } else if (!isDevelopment && enableLogging) {
        loggerTransports.push(new transports.Console({
            level: 'warn',
            format: format.combine(
                format.timestamp(),
                format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`),
            ),
        }));
    }

    return createLogger({
        level: isDevelopment || enableLogging ? 'debug' : 'info',
        format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`),
        ),
        transports: loggerTransports,
    });
}

module.exports = {
    initializeLogger,
};
