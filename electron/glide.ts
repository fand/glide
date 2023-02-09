import { join } from "node:path";
import { app, BrowserWindow, ipcMain, globalShortcut } from "electron";
import { Client as OSCClient, Bundle } from "node-osc";

export class Glide {
  page: number = 0;

  win: BrowserWindow;
  winNext: BrowserWindow;
  winPrev: BrowserWindow;

  transitionDict: {
    [index: number]: {
      transition: string;
      duration: number;
    };
  } = {};

  osc = new OSCClient("127.0.0.1", 9999);

  constructor(private pages: string[]) {
    this.win = this.#createWindow("GLIDE-ELECTRON WIN 1");
    this.winNext = this.#createWindow("GLIDE-ELECTRON WIN 2");
    this.winPrev = this.#createWindow("GLIDE-ELECTRON WIN 0");

    globalShortcut.register("Alt+Shift+Space", this.#onInit);
    globalShortcut.register("Alt+Shift+Right", this.#onNextPage);
    globalShortcut.register("Alt+Shift+Left", this.#onPrevPage);
    globalShortcut.register("Alt+Shift+Q", this.#onClose);

    ipcMain.on("init", this.#onInitWindow);
    ipcMain.on("set-transition", this.#onSetTransition);
  }

  // IPC handlers ================================

  #onSetTransition = (
    _e: any,
    index: number,
    transition: string,
    duration: number
  ) => {
    this.transitionDict[index] = { transition, duration };
  };

  #onInitWindow = (e: Electron.IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win === this.win) {
      this.#loadPage();
    } else if (win === this.winNext) {
      this.#loadNextPage();
    } else if (win === this.winPrev) {
      this.#loadPrevPage();
    }
  };

  // Keyboard shortcut handlers ================================

  #onInit = () => this.#sendInitOsc();

  #onNextPage = async () => {
    const oldPage = this.page;
    this.page = (this.page + 1) % this.pages.length;

    [this.winPrev, this.win, this.winNext] = [
      this.win,
      this.winNext,
      this.winPrev,
    ];
    this.#loadPage();
    this.#loadNextPage();
    this.#loadPrevPage();

    this.#sendPageOsc(oldPage, this.page, 1);
  };

  #onPrevPage = async () => {
    const oldPage = this.page;
    this.page = (oldPage - 1 + this.pages.length) % this.pages.length;

    [this.winPrev, this.win, this.winNext] = [
      this.winNext,
      this.winPrev,
      this.win,
    ];
    this.#loadPage();
    this.#loadNextPage();
    this.#loadPrevPage();

    this.#sendPageOsc(this.page, oldPage, -1);
  };

  #onClose = () => this.#sendKillOsc();

  // OSC methods ================================

  #sendInitOsc() {
    this.osc.send(new Bundle(["/init", this.pages.length, this.page]));
  }

  #sendPageOsc(page1: number, page2: number, direction: number) {
    const transition = this.transitionDict[page1];
    this.osc.send(
      new Bundle([
        "/page",
        page1,
        page2,
        transition.transition,
        transition.duration,
        direction,
      ])
    );
  }

  #sendKillOsc() {
    this.osc.send(new Bundle(["/kill"]));
  }

  // Internal logic ================================

  #createWindow(title: string) {
    const win = new BrowserWindow({
      title,
      //   icon: join(process.env.DIST, "build/glide_app_icon.svg"),
      icon: join(__dirname, "../../build/glide_app_icon.png"),
      frame: false,
      opacity: 0.99,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: true,
        preload: join(__dirname, "./preload.js"),
      },
      skipTaskbar: true,
      hiddenInMissionControl: true,
      acceptFirstMouse: true,
      roundedCorners: false,
    });
    win.maximize();

    if (app.isPackaged) {
      win.loadFile(join(process.env.DIST, "index.html"));
    } else {
      win.loadURL(process.env["VITE_DEV_SERVER_URL"]);
    }

    win.on("close", () => this.quit());

    return win;
  }

  #loadPage() {
    this.win.webContents.send("load", this.page, this.pages[this.page]);
    this.win.setHiddenInMissionControl(false);
    this.win.moveTop();
    this.win.focus();
  }

  #loadNextPage() {
    const index = (this.page + 1) % this.pages.length;
    this.winNext.webContents.send("load", index, this.pages[index]);
    this.winNext.setHiddenInMissionControl(true);
  }

  #loadPrevPage() {
    const index = (this.page + this.pages.length - 1) % this.pages.length;
    this.winPrev.webContents.send("load", index, this.pages[index]);
    this.winPrev.setHiddenInMissionControl(true);
  }

  setPages(pages: string[]) {
    this.pages = pages;

    this.#loadNextPage();
    this.#loadPrevPage();
    this.#loadPage();
  }

  quit() {
    this.#sendKillOsc();
    globalShortcut.unregisterAll();
    app.quit();
  }
}
