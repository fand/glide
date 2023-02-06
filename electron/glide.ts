import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { globalShortcut } from "electron";
import { Client as OSCClient, Bundle } from "node-osc";
import { ipcMain } from "electron";

function createWindow(title: string) {
  const win = new BrowserWindow({
    title,
    icon: join(process.env.PUBLIC, "logo.svg"),
    frame: false,
    opacity: 0.9,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: true,
      preload: join(__dirname, "./preload.js"),
    },
    skipTaskbar: true,
    hiddenInMissionControl: true,
  });
  win.setSimpleFullScreen(true);
  //   win.webContents.openDevTools();

  if (app.isPackaged) {
    win.loadFile(join(process.env.DIST, "index.html"));
  } else {
    win.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  }

  return win;
}

export class Glide {
  page: number = 0;

  win: BrowserWindow | undefined;
  winNext: BrowserWindow | undefined;
  winPrev: BrowserWindow | undefined;

  transitionDict: {
    [index: number]: {
      transition: string;
      duration: number;
    };
  } = {};

  constructor(private pageCount: number) {
    ipcMain.on("set-transition", this.onSetTransition);
  }

  onSetTransition = (
    _e: any,
    index: number,
    transition: string,
    duration: number
  ) => {
    console.log(">> set-transition", transition, duration);
    this.transitionDict[index] = { transition, duration };
  };

  async init() {
    const win = createWindow("GLIDE-ELECTRON WIN 1");
    const winNext = createWindow("GLIDE-ELECTRON WIN 2");
    const winPrev = createWindow("GLIDE-ELECTRON WIN 0");

    win.on("close", () => (this.win = undefined));
    winNext.on("close", () => (this.winNext = undefined));
    winPrev.on("close", () => (this.winPrev = undefined));

    await new Promise((o) => win.webContents.on("did-finish-load", o));
    await new Promise((o) => winNext.webContents.on("did-finish-load", o));
    await new Promise((o) => winPrev.webContents.on("did-finish-load", o));

    await new Promise((o) => setTimeout(o, 1000));

    win.webContents.send("load", 0);
    winNext.webContents.send("load", 1);
    winPrev.webContents.send("load", this.pageCount - 1);

    win.moveTop();

    const osc = new OSCClient("127.0.0.1", 9999);

    globalShortcut.register("Alt+Shift+Space", () => {
      osc.send(new Bundle(["/init", this.pageCount, this.page]));
    });

    globalShortcut.register("Alt+Shift+Q", () => {
      osc.send(new Bundle(["/kill"]));
    });

    globalShortcut.register("Alt+Shift+Right", async () => {
      const oldPage = this.page;
      this.page = (this.page + 1) % this.pageCount;

      let [winPrev, win, winNext] = [this.winPrev, this.win, this.winNext];

      [winPrev, win, winNext] = [win, winNext, winPrev];
      winNext?.webContents.send("load", (this.page + 1) % this.pageCount);

      win.moveTop();
      win.setHiddenInMissionControl(false);
      winNext.setHiddenInMissionControl(true);
      winPrev.setHiddenInMissionControl(true);

      const transition = this.transitionDict[oldPage];
      osc.send(
        new Bundle([
          "/page",
          oldPage,
          this.page,
          transition.transition,
          transition.duration,
        ])
      );

      [this.winPrev, this.win, this.winNext] = [winPrev, win, winNext];
    });

    globalShortcut.register("Alt+Shift+Left", () => {
      const oldPage = this.page;
      this.page = (oldPage - 1 + this.pageCount) % this.pageCount;

      let [winPrev, win, winNext] = [this.winPrev, this.win, this.winNext];

      [winPrev, win, winNext] = [winNext, winPrev, win];
      winPrev?.webContents.send(
        "load",
        (this.page - 1 + this.pageCount) % this.pageCount
      );

      win.moveTop();
      win.setHiddenInMissionControl(false);
      winNext.setHiddenInMissionControl(true);
      winPrev.setHiddenInMissionControl(true);

      const transition = this.transitionDict[this.page];
      osc.send(
        new Bundle([
          "/page",
          oldPage,
          this.page,
          transition.transition,
          transition.duration,
        ])
      );

      [this.winPrev, this.win, this.winNext] = [winPrev, win, winNext];
    });

    this.win = win;
    this.winNext = winNext;
    this.winPrev = winPrev;
  }

  closeAll() {
    this.win = undefined;
    this.winNext = undefined;
    this.winPrev = undefined;
  }

  quit() {
    globalShortcut.unregisterAll();
  }
}
