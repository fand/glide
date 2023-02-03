# Electronをキャプチャ

- Electronの `BrowserWindow.capturePage` でウインドウをキャプチャして画像ファイルに書き出す
- その後、GL側でテクスチャをリロードする
- 最初はTauriを使っていたけど、ハマりどころが多いので断念した
  - ローカルのファイルをfetchするだけで色々設定する必要があったり
  - capturePageがないので、macosの `screencapture` コマンドを使ったり
