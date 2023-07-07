export interface Options {
  puppeteer: any;
  /** Main page to connect */
  url: URL;
  headless?: boolean;
  viewport?: {
    width?: number;
    height?: number;
  };
  signal?: AbortSignal;
}
