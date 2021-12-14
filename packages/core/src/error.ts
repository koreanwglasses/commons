export class HTTPError extends Error {
  constructor(readonly code: number, message?: string) {
    super(message);
  }
}

export const BAD_REQUEST = (message?: string) => new HTTPError(400, message);
export const FORBIDDEN = (message?: string) => new HTTPError(403, message);
export const NOT_FOUND = (message?: string) => new HTTPError(404, message);

export const NOT_IMPLEMENTED = (message?: string) => new HTTPError(501, message);