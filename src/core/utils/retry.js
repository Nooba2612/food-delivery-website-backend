class RetryableTimeoutError extends Error {
    constructor(message, timeoutMs) {
        super(message);
        this.name = "RetryableTimeoutError";
        this.code = "ETIMEDOUT";
        this.timeoutMs = timeoutMs;
    }
}

const DEFAULT_RETRYABLE_CODES = new Set([
    "ECONNABORTED",
    "ECONNRESET",
    "ECONNREFUSED",
    "EHOSTUNREACH",
    "ENETDOWN",
    "ENETUNREACH",
    "ETIMEDOUT",
    "ESOCKET",
    "EAI_AGAIN",
]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error) {
    if (!error) {
        return false;
    }

    if (DEFAULT_RETRYABLE_CODES.has(error.code)) {
        return true;
    }

    const status = error.status || error.statusCode || error.response?.status;
    if (typeof status === "number" && status >= 500) {
        return true;
    }

    return false;
}

function withTimeout(promise, timeoutMs, operationName) {
    if (!timeoutMs) {
        return promise;
    }

    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(
                new RetryableTimeoutError(
                    `${operationName} timed out after ${timeoutMs}ms`,
                    timeoutMs,
                ),
            );
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        clearTimeout(timeoutId);
    });
}

async function retryAsync(operation, options = {}) {
    const {
        retries = 2,
        baseDelayMs = 1000,
        factor = 2,
        timeoutMs = 5000,
        operationName = "operation",
        shouldRetry = isRetryableError,
        onRetry,
    } = options;

    let attempt = 0;
    let lastError;

    while (attempt <= retries) {
        try {
            return await withTimeout(
                Promise.resolve().then(() => operation(attempt + 1)),
                timeoutMs,
                operationName,
            );
        } catch (error) {
            lastError = error;
            const hasMoreAttempts = attempt < retries;

            if (!hasMoreAttempts || !shouldRetry(error)) {
                throw error;
            }

            const delayMs = baseDelayMs * factor ** attempt;
            if (typeof onRetry === "function") {
                onRetry({
                    attempt: attempt + 1,
                    nextAttempt: attempt + 2,
                    delayMs,
                    error,
                    operationName,
                });
            }

            await sleep(delayMs);
            attempt += 1;
        }
    }

    throw lastError;
}

module.exports = {
    RetryableTimeoutError,
    isRetryableError,
    retryAsync,
};
