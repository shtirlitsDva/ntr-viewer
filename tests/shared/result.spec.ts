import { describe, expect, it } from "vitest";

import {
  andThen,
  combine,
  err,
  fromThrowable,
  isErr,
  isOk,
  map,
  mapError,
  match,
  ok,
  unwrapOr,
  unwrapOrElse,
} from "@shared/result";

describe("Result helpers", () => {
  it("creates ok values", () => {
    const value = ok(5);
    expect(isOk(value)).toBe(true);
    expect(value.ok).toBe(true);
    if (value.ok) {
      expect(value.value).toBe(5);
    }
  });

  it("creates error values", () => {
    const value = err("failure");
    expect(isErr(value)).toBe(true);
    expect(value.ok).toBe(false);
    if (!value.ok) {
      expect(value.error).toBe("failure");
    }
  });

  it("maps ok values", () => {
    const result = map(ok(2), (value) => value * 2);
    expect(result).toEqual(ok(4));
  });

  it("maps errors", () => {
    const result = mapError(err("bad"), (error) => `${error}!`);
    expect(result).toEqual(err("bad!"));
  });

  it("chains results", () => {
    const chained = andThen(ok(2), (value) => ok(value * 3));
    expect(chained).toEqual(ok(6));
  });

  it("unwraps with fallback", () => {
    expect(unwrapOr(ok(5), 10)).toBe(5);
    expect(unwrapOr(err("oops"), 10)).toBe(10);
  });

  it("unwraps with lazy fallback", () => {
    expect(unwrapOrElse(ok(2), () => 0)).toBe(2);
    expect(unwrapOrElse(err("nope"), (error) => error.length)).toBe(4);
  });

  it("matches branches", () => {
    const okMatch = match(ok("tick"), {
      ok: (value) => `ok:${value}`,
      err: () => "err",
    });
    const errMatch = match(err("boom"), {
      ok: () => "ok",
      err: (error) => `err:${error}`,
    });

    expect(okMatch).toBe("ok:tick");
    expect(errMatch).toBe("err:boom");
  });

  it("converts thrown errors to Result", () => {
    const success = fromThrowable(() => 1);
    const failure = fromThrowable(() => {
      throw new Error("broken");
    });

    expect(success).toEqual(ok(1));
    expect(failure.ok).toBe(false);
  });

  it("combines result lists", () => {
    const combined = combine([ok(1), ok(2)]);
    expect(combined).toEqual(ok([1, 2]));

    const failed = combine([ok(1), err("bad"), ok(3)]);
    expect(failed).toEqual(err("bad"));
  });
});
