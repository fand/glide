import { join } from "node:path";
import fs from "node:fs";
import { app, BrowserWindow } from "electron";
import { Glide } from "./glide";

// CONSTANTS
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

const PAGE_COUNT = fs
  .readdirSync(join(__dirname, "../../public"))
  .filter((f) => f.startsWith("page-")).length;

let glide: Glide | undefined;

app.whenReady().then(() => {
  glide = new Glide(PAGE_COUNT);
  glide.init();
});

app.on("window-all-closed", () => {
  glide?.closeAll();
});

app.on("quit", () => {
  glide.quit();
});
