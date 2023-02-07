import { join } from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { Glide } from "./glide";
import chokidar from "chokidar";

// CONSTANTS
process.env.DIST = join(__dirname, "..");
process.env.PUBLIC = app.isPackaged
  ? process.env.DIST
  : join(process.env.DIST, "../public");

const publicDir = join(__dirname, "../../public");
const pages = fs
  .readdirSync(publicDir)
  .filter((f) => f.startsWith("page-"))
  .sort();

let glide: Glide | undefined;

app.whenReady().then(() => {
  glide = new Glide(pages);
});

chokidar.watch(publicDir).on("change", () => {
  const pages = fs
    .readdirSync(publicDir)
    .filter((f) => f.startsWith("page-"))
    .sort();
  glide.setPages(pages);
});

app.on("window-all-closed", () => glide?.quit());
app.on("quit", () => glide?.quit());
