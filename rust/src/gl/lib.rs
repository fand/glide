use std::time::SystemTime;

use nannou_osc::Receiver;
use notan::draw::*;
use notan::prelude::*;
use rosc;

use crate::store;
use crate::store::TexInfo;

fn transition_to_index(name: &str) -> f32 {
    match name {
        "crossfade" => 0.0,
        "zoom" => 1.0,
        "zoom_blur" => 2.0,
        "glitch_slide" => 3.0,
        _ => 0.0,
    }
}

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

layout(binding = 0) uniform usampler2D tex0;
layout(binding = 1) uniform usampler2D tex1;
layout(binding = 2) uniform usampler2D tex2;

layout(set = 0, binding = 0) uniform Locals {
    float time;
    float from_page;
    float to_page;
    float page_count;

    float transition_index;
    float transition_duration;
};

vec4 readTex(vec2 uv, int i) {
    if (i == 0) { return texture(tex0, uv).bgra; }
    if (i == 1) { return texture(tex1, uv).bgra; }
    if (i == 2) { return texture(tex2, uv).bgra; }
    return vec4(1, 1, 0, 1);
}

vec4 debug(vec2 uv) {
    int id = int(step(0.5, uv.y) * 2 + step(0.5, uv.x));
    if (id == 0) {
        return texture(tex0, fract(uv * 2.));
    } else if (id == 1) {
        return texture(tex1, fract(uv * 2.));
    } else if (id == 2) {
        return texture(tex2, fract(uv * 2.));
    } else {
        return vec4(1, 0, 0, 1);
    }
}

vec4 debug2(vec2 uv) {
    int id = int(step(0.5, uv.y) * 2 + step(0.5, uv.x));
    if (id == 0) {
        return vec4(0, 0, 1, 1);
    } else if (id == 1) {
        return vec4(0, 1, 1, 1);
    } else if (id == 2) {
        return vec4(0, 1, 0, 1);
    } else {
        return vec4(1, 0, 0, 1);
    }
}

vec4 crossfade(vec2 uv, int page1, int page2, float t) {
    return mix(readTex(uv, page1), readTex(uv, page2), t);
}

vec4 zoom(vec2 uv, int page1, int page2, float t) {
    vec2 uv1 = (uv - .5) * (1. - t) + .5;
    vec2 uv2 = (uv - .5) / (t * 0.999 + 0.001) + .5;
    return mix(readTex(uv1, page1), readTex(fract(uv2), page2), t);
}
vec4 zoom_blur(vec2 uv, int page1, int page2, float t) {
    // vec2 uv1 = (uv - .5) * (1. - t) + .5;
    // vec2 uv2 = (uv - .5) / (t * 0.999 + 0.001) + .5;

    float blur = sin(t * 3.141593);

    vec2 offset = vec2(t * 2. - 1., 0) * 0.01 * blur;

    vec4 c1, c2;

    for (float i = 0.; i < 16.; i += 1.) {
        vec2 uvr = ((uv - .5) * (1. - blur * i * 0.02) + offset * i) + .5;
        vec2 uvg = ((uv - .5) * (1. - blur * i * 0.04) + offset * i) + .5;
        vec2 uvb = ((uv - .5) * (1. - blur * i * 0.05) + offset * i) + .5;

        {
            vec2 ra = readTex(uvr, page1).ra;
            vec2 ga = readTex(uvg, page1).ga;
            vec2 ba = readTex(uvb, page1).ba;
            c1 += vec4(ra.x, ga.x, ba.x, (ra.y + ga.y + ba.y) / 3.);
        }

        {
            vec2 ra = readTex(uvr, page2).ra;
            vec2 ga = readTex(uvg, page2).ga;
            vec2 ba = readTex(uvb, page2).ba;
            c2 += vec4(ra.x, ga.x, ba.x, (ra.y + ga.y + ba.y) / 3.);
        }
    }
    c1 /= 16.;
    c2 /= 16.;

    return mix(c1, c2, t);
}
vec4 glitch_slide(vec2 uv, int page1, int page2, float t) {
    float y = floor(uv.y * 53.) / 53.;
    float n = sin(y * 7.) * sin(y * 17.) * sin(y * 59.) * 0.5 + 0.5;

    vec4 c1, c2;
    {
        vec2 uvr = uv, uvg = uv, uvb = uv;
        uvr.x = fract(uvr.x + clamp(t * 1.8 - n * 0.2 - 0.1, 0., 1.));
        uvg.x = fract(uvg.x + clamp(t * 1.8 - n * 0.2, 0., 1.));
        uvb.x = fract(uvb.x + clamp(t * 1.8 - n * 0.2 + 0.1, 0., 1.));

        vec2 ra = readTex(uvr, page1).ra;
        vec2 ga = readTex(uvg, page1).ga;
        vec2 ba = readTex(uvb, page1).ba;
        c1 = vec4(ra.x, ga.x, ba.x, (ra.y + ga.y + ba.y) / 3.);
    }

    {
        vec2 uvr = uv, uvg = uv, uvb = uv;
        uvr.x = fract(uvr.x + clamp(t * 1.8 - n * 0.2 - 0.1, 0., 1.));
        uvg.x = fract(uvg.x + clamp(t * 1.8 - n * 0.2, 0., 1.));
        uvb.x = fract(uvb.x + clamp(t * 1.8 - n * 0.2 + 0.1, 0., 1.));

        vec2 ra = readTex(uvr, page2).ra;
        vec2 ga = readTex(uvg, page2).ga;
        vec2 ba = readTex(uvb, page2).ba;
        c2 = vec4(ra.x, ga.x, ba.x, (ra.y + ga.y + ba.y) / 3.);
    }

    return mix(c1, c2, smoothstep(.45, .55, t));
}

void main() {
    vec2 uv = v_uv;

    // color = debug(uv);
    // color = debug2(uv);

    int page1 = int(from_page + 1.) % 3;
    int page2 = int(to_page + 1.) % 3;

    float t = clamp(time / transition_duration, 0., 1.);
    t = smoothstep(0., 1., t);

    switch (int(transition_index)) {
        case 0: color = crossfade(uv, page1, page2, t); break;
        case 1: color = zoom(uv, page1, page2, t); break;
        case 2: color = zoom_blur(uv, page1, page2, t); break;
        case 3: color = glitch_slide(uv, page1, page2, t); break;
        default: color = crossfade(uv, page1, page2, t); break;
    }

    color.rgb /= color.a;
    color.a = color.a == 0.0 ? 0.0 : 1.0;
    color.rgb *= color.a;
}
"#
};

fn load_texture_from_image(gfx: &mut Graphics, src: &str) -> Result<Texture, String> {
    let image1 = image::open(src).unwrap();
    gfx.create_texture()
        .from_bytes(
            image1.as_bytes(),
            image1.width() as i32,
            image1.height() as i32,
        )
        .with_premultiplied_alpha()
        .build()
}

fn update_texture(gfx: &mut Graphics, texture: &mut Texture, tex: &TexInfo, id: usize) {
    let (w, h) = (texture.width() as usize, texture.height() as usize);
    if w != tex.width || h != tex.height {
        println!(
            ">> Texture {} size changed: ({}, {}) -> ({}, {})",
            w, h, tex.width, tex.height, id
        );
        *texture = gfx
            .create_texture()
            .from_bytes(&tex.buf, tex.width as i32, tex.height as i32)
            .with_premultiplied_alpha()
            .build()
            .unwrap();
    } else {
        gfx.update_texture(texture)
            .with_data(&tex.buf)
            .update()
            .unwrap();
    }
}

#[derive(AppState)]
struct State {
    clear_options: ClearOptions,
    pipeline: Pipeline,
    vbo: Buffer,
    ibo: Buffer,
    ubo: Buffer,

    texture0: Texture,
    texture1: Texture,
    texture2: Texture,

    start_time: SystemTime,
    prev_page: u32,
    page: u32,
    page_count: u32,
    transition_index: f32,
    transition_duration: f32,

    receiver: Receiver,
}

pub struct GLApp {}

impl GLApp {
    pub fn new() -> Self {
        Self {}
    }

    pub fn run(&self) -> Result<(), String> {
        let win = WindowConfig::default()
            .size(1920, 1080)
            // .maximized(true)
            .always_on_top(true)
            .mouse_passthrough(true)
            .title("GL!")
            .decorations(false)
            .transparent(true);

        notan::init_with(|gfx: &mut Graphics| GLApp::setup(gfx))
            .add_config(win)
            .add_config(DrawConfig)
            .update(Self::update)
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
            .with_texture_location(0, "tex0")
            .with_texture_location(1, "tex1")
            .with_texture_location(2, "tex2")
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

        let texture0 = load_texture_from_image(gfx, "src/gl/ferris.png").unwrap();
        let texture1 = load_texture_from_image(gfx, "src/gl/ferris.png").unwrap();
        let texture2 = load_texture_from_image(gfx, "src/gl/ferris.png").unwrap();

        let ubo = gfx
            .create_uniform_buffer(0, "Locals")
            .with_data(&vec![0.0])
            .build()
            .unwrap();

        let receiver = nannou_osc::receiver(9999).unwrap();

        State {
            clear_options,
            pipeline,
            vbo,
            ibo,
            ubo,

            texture0,
            texture1,
            texture2,

            start_time: SystemTime::now(),

            prev_page: 0,
            page: 0,
            page_count: 1,
            transition_index: 0.0,
            transition_duration: 0.0,

            receiver,
        }
    }

    fn update(app: &mut App, state: &mut State) {
        if let Some((msg, _)) = state.receiver.try_iter().next() {
            let mut msgs = vec![];
            msg.unfold(&mut msgs);

            for m in msgs {
                if m.addr == "/init" {
                    Self::osc_init(state, m);
                } else if m.addr == "/page" {
                    Self::osc_page(state, m);
                } else if m.addr == "/kill" {
                    app.exit();
                }
            }
        }
    }

    fn osc_init(state: &mut State, msg: rosc::OscMessage) {
        if let Some(args) = msg.args {
            println!(">> osc_init: {:?}", args);
            state.page_count = args[0].clone().float().unwrap() as u32;
            state.prev_page = args[1].clone().float().unwrap() as u32;
            state.page = args[1].clone().float().unwrap() as u32;
            println!(">> prev_page: {}, page: {}", state.prev_page, state.page);
        }
    }

    fn osc_page(state: &mut State, msg: rosc::OscMessage) {
        if let Some(args) = msg.args {
            println!(">> osc_page: {:?}", args);
            state.start_time = SystemTime::now();
            state.prev_page = args[0].clone().float().unwrap() as u32;
            state.page = args[1].clone().float().unwrap() as u32;
            state.transition_index = transition_to_index(&args[2].clone().string().unwrap());
            state.transition_duration = args[3].clone().float().unwrap_or(1.0);
        }
    }

    fn draw(gfx: &mut Graphics, state: &mut State) {
        let now = SystemTime::now();
        if let Ok(n) = now.duration_since(state.start_time) {
            let time = n.as_secs_f32();
            gfx.set_buffer_data(
                &state.ubo,
                &vec![
                    time,
                    state.prev_page as f32,
                    state.page as f32,
                    state.page_count as f32,
                    state.transition_index,
                    state.transition_duration,
                ],
            );
        }

        let mut renderer = gfx.create_renderer();

        if let Some(tex) = store::get_buffer(0) {
            update_texture(gfx, &mut state.texture0, tex, 0);
        }
        if let Some(tex) = store::get_buffer(1) {
            update_texture(gfx, &mut state.texture1, tex, 1);
        }
        if let Some(tex) = store::get_buffer(2) {
            update_texture(gfx, &mut state.texture2, tex, 2);
        }

        gfx.clean();
        renderer.begin(Some(&state.clear_options));
        renderer.set_pipeline(&state.pipeline);
        renderer.bind_texture(0, &state.texture0);
        renderer.bind_texture(1, &state.texture1);
        renderer.bind_texture(2, &state.texture2);
        renderer.bind_buffers(&[&state.vbo, &state.ibo]);
        renderer.draw(0, 6);
        renderer.end();

        gfx.render(&renderer);

        // println!(">> addrs: {:?}", a);
    }
}
