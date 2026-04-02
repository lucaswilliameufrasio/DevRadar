import { runtimeConfig } from '../config/runtimeConfig'

export class HttpClient {
  constructor(executor = fetch, defaultTimeout = 20000) {
    this.executor = executor;
    this.defaultTimeout = defaultTimeout;
    this.requestInterceptors = [];
    this.responseInterceptors = [];
  }

  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  async request({
    path,
    method = 'GET',
    body,
    query,
    headers,
    baseUrl,
    timeout = this.defaultTimeout,
  }) {
    let config = {
      path,
      method,
      body,
      query,
      headers,
      baseUrl,
      timeout,
    };

    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    const finalBase = config.baseUrl ?? runtimeConfig.apiBaseUrl;
    
    let url = finalBase;
    if (!url.endsWith('/') && !path.startsWith('/')) {
        url += '/';
    }
    url += path;

    const urlObj = new URL(url);

    if (config.query) {
      for (const [key, value] of Object.entries(config.query)) {
        if (value !== undefined && value !== null) {
          urlObj.searchParams.set(key, String(value));
        }
      }
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, config.timeout);

    try {
      const response = await this.executor(urlObj.toString(), {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: this.parseRequestBody(config.method ?? 'GET', config.body),
        signal: abortController.signal,
      });

      const contentType = response.headers.get('content-type') ?? '';
      const parsed = await this.parseResponseBody(contentType, response);
      let result = {
        statusCode: response.status,
        body: parsed,
      };

      for (const interceptor of this.responseInterceptors) {
        result = await interceptor(config, result);
      }

      if (response.status === 429) {
        throw new HttpClientError(
          429,
          'Too many requests. Please try again in a minute.',
          'RATE_LIMIT_EXCEEDED'
        );
      }

      if (!response.ok) {
        const errorBody = result.body || {};
        throw new HttpClientError(
          result.statusCode,
          errorBody.message || 'Unknown Error',
          errorBody.error_code || 'UNKNOWN_ERROR',
          errorBody.extra
        );
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new HttpClientError(408, 'Request Timeout', 'HTTP_REQUEST_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  parseRequestBody(method, body) {
    if (method === 'GET' || body === undefined || body === null) {
      return undefined;
    }

    if (typeof body === 'string') {
      return body;
    }

    return JSON.stringify(body);
  }

  async parseResponseBody(contentType, response) {
    if (contentType.includes('application/json') || contentType.length === 0) {
      const raw = await response.text();

      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }

    if (contentType.includes('text/')) {
      return await response.text();
    }

    return await response.blob();
  }
}

export class HttpClientError extends Error {
  constructor(statusCode, message, error_code, extra) {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.error_code = error_code;
    this.extra = extra;
  }
}
