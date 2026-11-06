// An error we throw on purpose. The error handler turns it into a clean JSON response.
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
