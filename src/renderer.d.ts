export interface IElectronAPI {
  onLoad: (callback: any) => void;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
