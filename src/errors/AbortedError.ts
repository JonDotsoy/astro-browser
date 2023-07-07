export class AbortedError extends Error {
  waitings: Promise<any>[] = [];
}
