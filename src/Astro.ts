import puppeteer, {
  Browser,
  CDPSession,
  Frame,
  Page,
} from "https://deno.land/x/puppeteer@16.2.0/mod.ts";
import { AbortedError } from "./errors/AbortedError.ts";
import { Options } from "./Options.ts";

/**
 * Astro Browser
 *
 * Create a instance of a browser
 */
export class Astro {
  constructor(
    private _browser?: Browser,
    private _mainPage?: Page,
    private _frameSelector?: Item[],
    private session?: CDPSession,
  ) {}

  async close() {
    if (this._browser) {
      await this._browser.close();
    }
  }

  async init(option: Options) {
    this._browser = this._browser ?? await puppeteer.launch({
      headless: option.headless ?? true,
    });

    option.signal?.addEventListener("abort", (event) => {
      const closingPromise = this.close();
      if (event.target instanceof AbortSignal) {
        if (event.target.reason instanceof AbortedError) {
          event.target.reason.waitings.push(closingPromise);
        }
      }
    });

    const pages = await this.browser.pages();

    this._mainPage = this._mainPage ?? pages.at(0) ??
      await this.browser.newPage();
    this._frameSelector = [];

    this.session = this.session ??
      await this.mainPage.target().createCDPSession();

    const downloadFolder = option.downloadFolder ??
      new URL(await Deno.makeTempDir(), `file:///`);

    await Deno.mkdir(downloadFolder, { recursive: true });

    this.session.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadFolder.pathname,
    });

    await this.mainPage.setViewport({
      width: option.viewport?.width ?? 1080,
      height: option.viewport?.height ?? 600,
    });
    await this.mainPage.goto(option.url.toString());

    return this;
  }

  get browser(): Browser {
    if (!this._browser) throw new Error(`Cannot found browser instance`);
    return this._browser;
  }

  get mainPage(): Page {
    if (!(this._mainPage instanceof Page)) {
      throw new Error(`Cannot found page instance`);
    }
    return this._mainPage;
  }

  async getPageOrFrame(): Promise<Page | Frame> {
    const p = this._frameSelector;
    if (p instanceof Page) return p;
    if (p instanceof Frame) return p;

    if (Array.isArray(p)) {
      while (true) {
        try {
          let relativePage: Frame | Page = this.mainPage;
          for (const item of p) {
            const r = await Astro.waitItem(relativePage, item);
            const e = await r.contentFrame();
            if (!e) throw new Error(`Failed get content frame`);
            relativePage = e;
          }
          return relativePage;
        } catch {
          // console.warn(ex);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }

    throw new Error(`Cannot found Page or Frame`);
  }

  async waitItem(item: Item) {
    return Astro.waitItem(await this.getPageOrFrame(), item);
  }

  static async waitItem(mainPage: Page | Frame, item: Item) {
    while (true) {
      if (item.matchText) {
        for (const elm of await mainPage.$$(item.toCSSSelector())) {
          const t: string = await elm.evaluate((elm) => elm.innerText);
          if (t.match(item.matchText)) return elm;
        }
      } else {
        const elm = await mainPage.$(item.toCSSSelector());
        if (elm) return elm;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async getValueOfAttribute(item: Item, attribute: string): Promise<string> {
    const elm = await this.waitItem(item);
    const v = await elm.evaluate(
      (elm, attribute: string) => elm.attributes[attribute].value,
      attribute,
    );
    return v;
  }

  async getOuterHTML(item: Item): Promise<string> {
    const elm = await this.waitItem(item);
    return await elm.evaluate((e) => e.outerHTML);
  }

  async click(item: Item) {
    const elm = await this.waitItem(item);
    await elm.click();
    return this;
  }

  async type(item: Item, value: string) {
    const elm = await this.waitItem(item);
    await elm.type(value);
    return this;
  }

  async waitLoad() {
    const t = 2_000;
    await new Promise<void>((r) => {
      const handler = () => {
        r();
      };

      let timer: any;

      this.mainPage.on("response", () => {
        clearTimeout(timer);
        timer = setTimeout(handler, t);
      });
    });
  }

  async contentFrame(item: Item) {
    const newAstro = new Astro(
      this.browser,
      this.mainPage,
      [...this._frameSelector ?? [], item],
      this.session,
    );

    await this.getPageOrFrame();

    return newAstro;
  }
}

export class Item {
  matchText?: string;
  cssSelectorTagName?: string;
  cssSelectorId?: string;
  cssSelectorClassNames: string[] = [];
  cssSelectorAttributes: [string, undefined | string][] = [];
  deep?: Item;

  withDeep(item: Item): Item {
    this.deep = item;
    return this;
  }

  byID(value: string): Item {
    this.cssSelectorId = value;
    return this;
  }

  withTagName(name: string): Item {
    this.cssSelectorTagName = name;
    return this;
  }

  withText(matchText: string): Item {
    this.matchText = matchText;
    return this;
  }

  withClassNames(className: string): Item {
    this.cssSelectorClassNames.push(className);
    return this;
  }

  withAttribute(name: string, value?: string): Item {
    this.cssSelectorAttributes.push([name, value]);
    return this;
  }

  toCSSSelector(): string {
    const classNameSelectors = this.cssSelectorClassNames.map((e) => `.${e}`)
      .join(``);
    const idSelector = this.cssSelectorId ? `#${this.cssSelectorId}` : ``;
    const tagNameSelector = this.cssSelectorTagName ?? ``;
    const attributesSelectors = this.cssSelectorAttributes.map(
      ([cssSelectorAttribute, cssSelectorAttributeValue]) => {
        const V = cssSelectorAttributeValue
          ? `=${JSON.stringify(cssSelectorAttributeValue)}`
          : ``;
        const G = cssSelectorAttribute ? `[${cssSelectorAttribute}${V}]` : ``;
        return `${G}`;
      },
    );
    const deepSelector = this.deep ? ` ${this.deep.toCSSSelector()}` : ``;

    return `${tagNameSelector}${idSelector}${classNameSelectors}${attributesSelectors}${deepSelector}`;
  }
}
