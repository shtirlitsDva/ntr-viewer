export type Result<T, E> = Success<T> | Failure<E>;

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Failure<E> {
  readonly ok: false;
  readonly error: E;
}

export const ok = <T>(value: T): Success<T> => ({ ok: true, value });

export const err = <E>(error: E): Failure<E> => ({ ok: false, error });

export const map = <T, U, E>(result: Result<T, E>, mapper: (value: T) => U): Result<U, E> =>
  result.ok ? ok(mapper(result.value)) : result;

export const flatMap = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, E>
): Result<U, E> => (result.ok ? mapper(result.value) : result);
