/**
 * A discriminated union-based Result helper, inspired by Rust's Result<T, E>.
 * Keeps error handling explicit and works well with strict TypeScript settings.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<T> {
  ok: true;
  value: T;
}

export interface Err<E> {
  ok: false;
  error: E;
}

export const ok = <T, E = never>(value: T): Result<T, E> => ({
  ok: true,
  value,
});

export const err = <T = never, E = unknown>(error: E): Result<T, E> => ({
  ok: false,
  error,
});

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result.ok;

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  !result.ok;

export const map = <T, U, E>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> =>
  result.ok ? ok(mapper(result.value)) : result;

export const mapError = <T, E, F>(
  result: Result<T, E>,
  mapper: (error: E) => F,
): Result<T, F> => (result.ok ? result : err(mapper(result.error)));

export const andThen = <T, U, E, F = E>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, F>,
): Result<U, E | F> => (result.ok ? mapper(result.value) : result);

export const unwrapOr = <T, E>(result: Result<T, E>, fallback: T): T =>
  result.ok ? result.value : fallback;

export const unwrapOrElse = <T, E>(
  result: Result<T, E>,
  fallback: (error: E) => T,
): T => (result.ok ? result.value : fallback(result.error));

export const match = <T, E, U>(
  result: Result<T, E>,
  branches: { ok: (value: T) => U; err: (error: E) => U },
): U => (result.ok ? branches.ok(result.value) : branches.err(result.error));

export function fromThrowable<T>(fn: () => T): Result<T, unknown>;
export function fromThrowable<T, E>(
  fn: () => T,
  onError: (error: unknown) => E,
): Result<T, E>;
export function fromThrowable<T, E>(
  fn: () => T,
  onError?: (error: unknown) => E,
): Result<T, unknown> | Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    if (onError) {
      return err(onError(error));
    }
    return err(error);
  }
}

export const combine = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
};
