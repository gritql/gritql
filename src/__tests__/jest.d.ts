/// <reference types="jest" />

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeDeepCloseTo(expected: any, numDigits?: number): R;
    }
  }
}

export {};