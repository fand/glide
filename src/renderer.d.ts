export interface IElectronAPI {
  init: () => void;
  onLoad: (callback: any) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
