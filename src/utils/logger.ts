
export enum LogLevel {
    DEBUG = 0,
    LOG = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

export class Logger {
    /**
     *  Everything while developing; warnings and errors only in a build that ships.
     *
     *  `import.meta.env.DEV` is replaced by Vite at build time - true under `npm run dev` and
     *  in the tests, false in `npm run build` - so a store build does not write a debug line
     *  for every save, sync and favicon into the console of every user.
     */
    static level: LogLevel = import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.WARN;

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
