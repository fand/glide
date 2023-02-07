import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  init: () => ipcRenderer.send("init"),
  onLoad: (callback: any) => ipcRenderer.on("load", callback),
});
