## 案1: MarkdownをCanvasで描画する

- HTMLCanvasElementはWebGLテクスチャのソースとして渡せる
  - CanvasでMarkdownを描画すれば、WebGLでいじり放題になる
- pros: 頑張ればできる
- cons: レイアウト処理が大変
- cons: ネイティブで動かすのが難しい
  - Electronの場合、UInt8Arrayでmainプロセスに渡すことは可能
    （仕事でやったことがある）
