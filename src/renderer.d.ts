export interface IElectronAPI {
  onLoad: (callback: any) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
