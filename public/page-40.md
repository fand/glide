---
theme: yellow_black
transition: zoom_blur
duration: 2
---
# あとはトランジションのシェーダーを書いてあげれば……

```glsl
vec4 crossfade(vec2 uv, int page1, int page2, float t) {
    return mix(readTex(uv, page1), readTex(uv, page2), t);
}

vec4 swipe(vec2 uv, int page1, int page2, float t) {
    uv.x += t;
    if (uv.x < 1.) {
        return readTex(uv, page1);
    } else {
        return readTex(uv - vec2(1, 0), page2);
    }
}
```
