import { runtimeConfig } from '../config/runtimeConfig'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiErrorResponse {
  message: string
  error_code: string
  extra?: unknown
}

export interface HttpRequestOptions {
  path: string
  method?: HttpMethod
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  baseUrl?: string
  timeout?: number
}

export interface HttpResponse<T> {
  statusCode: number
  body: T
}

export type HttpExecutor = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type RequestInterceptor = (
  config: HttpRequestOptions,
) => Promise<HttpRequestOptions> | HttpRequestOptions
type ResponseInterceptor = <T = unknown>(
  config: HttpRequestOptions,
  response: HttpResponse<T>,
) => Promise<HttpResponse<T>> | HttpResponse<T>

export class HttpClient {
  private readonly requestInterceptors: RequestInterceptor[] = []
  private readonly responseInterceptors: ResponseInterceptor[] = []

  constructor(
    private readonly executor: HttpExecutor = fetch,
    private readonly defaultTimeout = 20_000,
  ) {}

  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor)
  }

  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor)
  }

  async request<T>({
    path,
    method = 'GET',
    body,
    query,
    headers,
    baseUrl,
    timeout = this.defaultTimeout,
  }: HttpRequestOptions): Promise<HttpResponse<T>> {
    let config: HttpRequestOptions = {
      path,
      method,
      body,
      query,
      headers,
      baseUrl,
      timeout,
    }

    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config)
    }

    const finalBase = config.baseUrl ?? runtimeConfig.apiBaseUrl
    const url = new URL(config.path, finalBase)

    if (config.query) {
      for (const [key, value] of Object.entries(config.query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), config.timeout)

    try {
      const response = await this.executor(url.toString(), {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: this.parseRequestBody(config.method ?? 'GET', config.body),
        signal: abortController.signal,
      })

      const contentType = response.headers.get('content-type') ?? ''
      const parsed = await this.parseResponseBody<T>(contentType, response)
      let result: HttpResponse<T> = {
        statusCode: response.status,
        body: parsed,
      }

      for (const interceptor of this.responseInterceptors) {
        result = await interceptor<T>(config, result)
      }

      if (response.status === 429) {
        throw new HttpClientError(
          429,
          'Too many requests. Please try again in a minute.',
          'RATE_LIMIT_EXCEEDED'
        )
      }

      if (!response.ok) {
        const errorBody = result.body as unknown as ApiErrorResponse;
        throw new HttpClientError(
          result.statusCode,
          errorBody.message || 'Unknown Error',
          errorBody.error_code || 'UNKNOWN_ERROR',
          errorBody.extra
        )
      }

      return result
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HttpClientError(408, 'Request Timeout', 'HTTP_REQUEST_TIMEOUT')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private parseRequestBody(method: HttpMethod, body: unknown): string | undefined {
    if (method === 'GET' || body === undefined || body === null) {
      return undefined
    }

    if (typeof body === 'string') {
      return body
    }

    return JSON.stringify(body)
  }

  private async parseResponseBody<T>(contentType: string, response: Response): Promise<T> {
    if (contentType.includes('application/json') || contentType.length === 0) {
      const raw = await response.text()

      try {
        return JSON.parse(raw) as T
      } catch {
        return raw as T
      }
    }

    if (contentType.includes('text/')) {
      return (await response.text()) as T
    }

    const blob = await response.blob()
    return blob as unknown as T
  }
}

export class HttpClientError extends Error {
  constructor(
    readonly statusCode: number,
    readonly message: string,
    readonly error_code: string,
    readonly extra?: unknown,
  ) {
    super(message)
  }
}
