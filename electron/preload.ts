import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  onLoad: (callback: any) => ipcRenderer.on("load", callback),
});
