import type { ApiErrorCode } from "@nexo/shared";

const HTTP_STATUS: Record<ApiErrorCode, 400 | 401 | 403 | 404 | 409 | 500 | 503> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
  UNAVAILABLE: 503,
};

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get status() {
    return HTTP_STATUS[this.code];
  }
}

/** Chamado inexistente e chamado de outra pessoa dão a mesma resposta: não revela que existe. */
export const ticketNotFound = (id: string) =>
  new ApiError("NOT_FOUND", `Chamado ${id} não encontrado.`);
