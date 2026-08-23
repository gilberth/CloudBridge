/** Error carrying the HTTP status the API should answer with. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'bad_request', message, details);

export const unauthorized = (message = 'No autenticado') =>
  new HttpError(401, 'unauthorized', message);

export const forbidden = (message = 'No autorizado') => new HttpError(403, 'forbidden', message);

export const notFound = (message: string) => new HttpError(404, 'not_found', message);

export const conflict = (message: string) => new HttpError(409, 'conflict', message);

/** The rclone daemon answered with an error, or could not be reached at all. */
export const upstream = (message: string, details?: unknown) =>
  new HttpError(502, 'rclone_error', message, details);
