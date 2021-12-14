export class ValidationError extends Error {
  code = 400;
  name = "ValidationError";
  constructor(message?: string) {
    super(message);
  }
}
