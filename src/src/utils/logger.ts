
export enum LogLevel {
    DEBUG = 0,
    LOG = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

export class Logger {
    static level: LogLevel = LogLevel.DEBUG;

    constructor(private readonly scope: string) {}

    private shouldLog(level: LogLevel) {
        return level >= Logger.level;
    }

    private fmt(method: string, level: LogLevel, args: unknown[]) {
        if (!this.shouldLog(level)) return;

        const prefix = `%c[${this.scope}.${method}]`;
        const style = 'color:#4CAF50;font-weight:bold';

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(prefix, style, ...args);
                break;
            case LogLevel.LOG:
                console.log(prefix, style, ...args);
                break;
            case LogLevel.WARN:
                console.warn(prefix, style, ...args);
                break;
            case LogLevel.ERROR:
                console.error(prefix, style, ...args);
                break;
        }
    }

    debug(method: string, ...args: unknown[]) {
        this.fmt(method, LogLevel.DEBUG, args);
    }

    log(method: string, ...args: unknown[]) {
        this.fmt(method, LogLevel.LOG, args);
    }

    warn(method: string, ...args: unknown[]) {
        this.fmt(method, LogLevel.WARN, args);
    }

    error(method: string, ...args: unknown[]) {
        this.fmt(method, LogLevel.ERROR, args);
    }
}
