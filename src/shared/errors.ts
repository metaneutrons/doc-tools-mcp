export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly userMessage: string;
  abstract readonly recoveryHint?: string;

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toString(): string {
    let msg = `${this.userMessage}\n\nError Code: ${this.code}`;
    if (this.recoveryHint) msg += `\n\nHow to fix: ${this.recoveryHint}`;
    if (this.cause) msg += `\n\nTechnical details: ${this.cause.message}`;
    return msg;
  }
}

export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly userMessage: string;
  readonly recoveryHint: string;

  constructor(message: string, public readonly field?: string, cause?: Error) {
    super(message, cause);
    this.userMessage = message;
    this.recoveryHint = field ? `Check the '${field}' parameter.` : 'Check your input parameters.';
  }
}

export class FileError extends BaseError {
  readonly code = 'FILE_ERROR';
  readonly userMessage: string;
  readonly recoveryHint: string;

  constructor(message: string, public readonly filePath: string, cause?: Error) {
    super(message, cause);
    this.userMessage = message;
    this.recoveryHint = `Check that '${filePath}' exists and is readable.`;
  }
}

export class NotFoundError extends BaseError {
  readonly code = 'NOT_FOUND';
  readonly userMessage: string;
  readonly recoveryHint = 'Use bib:search or bib:list to find available entries.';

  constructor(id: string) {
    super(`Entry '${id}' not found`);
    this.userMessage = `Entry '${id}' not found in the bibliography.`;
  }
}

export class DuplicateError extends BaseError {
  readonly code = 'DUPLICATE_ID';
  readonly userMessage: string;
  readonly recoveryHint = 'Use a different ID or update the existing entry with bib:update.';

  constructor(id: string) {
    super(`Entry '${id}' already exists`);
    this.userMessage = `Entry '${id}' already exists in the bibliography.`;
  }
}
