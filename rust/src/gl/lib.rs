use std::borrow::Borrow;
use std::time::SystemTime;

use image::DynamicImage;
use notan::draw::*;
use notan::prelude::*;

use crate::store;

//language=glsl
const VERT: ShaderSource = notan::vertex_shader! {
    r#"
#version 450
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;

layout(location = 0) out vec2 v_uv;

void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
"#
};

//language=glsl
const FRAG: ShaderSource = notan::fragment_shader! {
    r#"
#version 450
precision mediump float;

layout(location = 0) in vec2 v_uv;
layout(location = 0) out vec4 color;

layout(binding = 0) uniform usampler2D tex1;
layout(binding = 1) uniform usampler2D tex2;

layout(set = 0, binding = 0) uniform Locals {
    float time;
};

void main() {
    vec2 uv = v_uv;

    // vec4 c1 = texture(tex1, uv);
    // vec4 c2 = texture(tex2, uv);

    // if (c1.a != 0.0) { c1.rgb /= c1.a; }
    // if (c2.a != 0.0) { c2.rgb /= c2.a; }

    // if (sin(time * 3.) > 0.) {
    //     color = mix(c1, c2, fract(time));
    // } else {
    //     discard;
    // }

    if (fract(time * 2.) < 0.5) {
        color = texture(tex1, uv);
    } else {
        color = texture(tex2, uv);
    }
    color.rgb /= color.a;
}
"#
};

#[derive(AppState)]
struct State {
    clear_options: ClearOptions,
    pipeline: Pipeline,
    vbo: Buffer,
    ibo: Buffer,
    ubo: Buffer,

    texture1: Texture,
    texture2: Texture,
    image1: DynamicImage,
    image2: DynamicImage,
    start_time: SystemTime,
}

pub struct GLApp {}

impl GLApp {
    pub fn new() -> Self {
        Self {}
    }

    pub fn run(&self) -> Result<(), String> {
        let win = WindowConfig::default()
            .size(1200, 900)
            .always_on_top(true)
            .mouse_passthrough(true)
            .decorations(false)
            .transparent(true);

        notan::init_with(|gfx: &mut Graphics| GLApp::setup(gfx))
            .add_config(win)
            .add_config(DrawConfig)
            .draw(Self::draw)
            .build()
    }

    fn setup(gfx: &mut Graphics) -> State {
        let clear_options = ClearOptions::color(Color::new(0.0, 0.0, 0.0, 0.0));

        let vertex_info = VertexInfo::new()
            .attr(0, VertexFormat::Float32x2)
            .attr(1, VertexFormat::Float32x2);

        let pipeline = gfx
            .create_pipeline()
            .from(&VERT, &FRAG)
            .with_vertex_info(&vertex_info)
            .with_color_blend(BlendMode::NONE)
            .with_texture_location(0, "tex1")
            .with_texture_location(1, "tex2")
            .build()
            .expect("failed to compile pipeline");
        // .unwrap();

        #[rustfmt::skip]
        let vertices = [
            -1.0, -1.0,  0.0, 1.0,
            1.0, -1.0,   1.0, 1.0,
            -1.0, 1.0,   0.0, 0.0,
            1.0, 1.0,   1.0, 0.0,
        ];
        let vbo = gfx
            .create_vertex_buffer()
            .with_info(&vertex_info)
            .with_data(&vertices)
            .build()
            .unwrap();

        #[rustfmt::skip]
        let indices = [
            0, 1, 2,
            1, 2, 3,
        ];
        let ibo = gfx
            .create_index_buffer()
            .with_data(&indices)
            .build()
            .unwrap();

        let image1 = image::open("src/gl/ferris.png").unwrap();
        let image2 = image::open("src/gl/gopher.png").unwrap();

        let texture1 = gfx
            .create_texture()
            .from_bytes(
                image1.as_bytes(),
                image1.width() as i32,
                image1.height() as i32,
            )
            .with_premultiplied_alpha()
            .build()
            .unwrap();
        let texture2 = gfx
            .create_texture()
            .from_bytes(
                image2.as_bytes(),
                image2.width() as i32,
                image2.height() as i32,
            )
            .with_premultiplied_alpha()
            .build()
            .unwrap();

        let ubo = gfx
            .create_uniform_buffer(0, "Locals")
            .with_data(&vec![0.0])
            .build()
            .unwrap();

        State {
            clear_options,
            pipeline,
            vbo,
            ibo,
            ubo,

            image1,
            image2,
            texture1,
            texture2,

            start_time: SystemTime::now(),
        }
    }

    fn draw(gfx: &mut Graphics, state: &mut State) {
        let now = SystemTime::now();
        if let Ok(n) = now.duration_since(state.start_time) {
            gfx.set_buffer_data(&state.ubo, &vec![n.as_secs_f32()]);
        }

        let mut renderer = gfx.create_renderer();

        if let Some(buf) = store::get_buffer(0) {
            let tex_size = (state.texture1.width() * state.texture1.height() * 4.0) as usize;
            if tex_size != buf.len() {
                println!(">> tex1: {} / {}", tex_size, buf.len());
                state.texture1 = gfx
                    .create_texture()
                    .from_bytes(buf, 800, 600)
                    .with_premultiplied_alpha()
                    .build()
                    .unwrap();
            } else {
                gfx.update_texture(&mut state.texture1)
                    .with_data(buf)
                    .update()
                    .unwrap();
            }
        }
        if let Some(buf) = store::get_buffer(1) {
            let tex_size = (state.texture2.width() * state.texture2.height() * 4.0) as usize;
            if tex_size != buf.len() {
                println!(">> tex2: {} / {}", tex_size, buf.len());
                state.texture2 = gfx
                    .create_texture()
                    .from_bytes(buf, 800, 600)
                    .with_premultiplied_alpha()
                    .build()
                    .unwrap();
            } else {
                gfx.update_texture(&mut state.texture2)
                    .with_data(buf)
                    .update()
                    .unwrap();
            }
        }

        gfx.clean();
        renderer.begin(Some(&state.clear_options));
        renderer.set_pipeline(&state.pipeline);
        // renderer.bind_texture(0, &state.texture1.borrow());
        // renderer.bind_texture(1, &state.texture2.borrow());
        renderer.bind_buffers(&[&state.vbo, &state.ibo]);
        renderer.draw(0, 6);
        renderer.end();

        gfx.render(&renderer);
    }
}
