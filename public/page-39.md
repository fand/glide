# テクスチャに渡す

```rust
if let Some(tex) = store::get_buffer(0) {
    update_texture(gfx, &mut state.texture0, tex, 0);
}
```
