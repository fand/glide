---
theme: green_black
---
# Rust GLライブラリ比較

## wgpu
- WebGPUのラッパー
- ネイティブでもwasmでも動く
- ローレベル
  - Vulkan等を直接触るのに比べると楽だけど、それでも行数がおおい

## nannou
- Processing / openFrameworksっぽいAPI
- 作品を作るには便利
- wgpuのAPIを直接触る必要がある

## three-d
- Three.jsっぽいAPI
  - カメラ、マテリアルなどの概念が存在する
- 細かいウインドウ制御ができない

## notan
- JSでいうとreglに近いAPI
- とにかく短くグラフィックスパイプラインを作れる
- バックエンドはglowという別のライブラリを使っている (wgpuと同じ)
