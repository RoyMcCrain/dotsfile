import assert from "node:assert/strict";

type ErrorClass = new (...args: never[]) => object;

const matchesExpectedError = (
  error: unknown,
  errorClass?: ErrorClass,
  messageIncludes?: string,
) => {
  if (errorClass !== undefined && !(error instanceof errorClass)) return false;
  if (messageIncludes === undefined) return true;
  return error instanceof Error && error.message.includes(messageIncludes);
};

export const assertEquals = (
  actual: unknown,
  expected: unknown,
  message?: string,
) => {
  assert.deepEqual(actual, expected, message);
};

export const assertMatch = (
  actual: string,
  expected: RegExp,
  message?: string,
) => {
  assert.match(actual, expected, message);
};

export const assertStringIncludes = (
  actual: string,
  expected: string,
  message?: string,
) => {
  assert.equal(actual.includes(expected), true, message);
};

export const assertThrows = (
  fn: () => unknown,
  errorClass?: ErrorClass,
  messageIncludes?: string,
) => {
  assert.throws(fn, (error: unknown) =>
    matchesExpectedError(error, errorClass, messageIncludes));
};

export const assertRejects = async (
  fn: () => Promise<unknown>,
  errorClass?: ErrorClass,
  messageIncludes?: string,
) => {
  await assert.rejects(fn, (error: unknown) =>
    matchesExpectedError(error, errorClass, messageIncludes));
};
