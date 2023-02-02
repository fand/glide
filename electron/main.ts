import { join } from "path";
import { app, BrowserWindow } from "electron";

// Prepare paths
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    icon: join(process.env.PUBLIC, "logo.svg"),
    frame: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      preload: join(__dirname, "./preload.js"),
    },
  });
  //   win.maximize();

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (app.isPackaged) {
    win.loadFile(join(process.env.DIST, "index.html"));
  } else {
    win.loadURL(process.env["VITE_DEV_SERVER_URL"]);
  }
}

app.on("window-all-closed", () => {
  win = null;
});

app.whenReady().then(createWindow);
