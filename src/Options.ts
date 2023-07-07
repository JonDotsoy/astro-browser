export interface Options {
  /** Main page to connect */
  url: URL;
  headless?: boolean;
  viewport?: {
    width?: number;
    height?: number;
  };
  signal?: AbortSignal;
}
