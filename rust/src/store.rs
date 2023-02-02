use once_cell::sync::Lazy;
use std::collections::HashMap;

pub struct TexInfo {
    pub buf: Vec<u8>,
    pub width: usize,
    pub height: usize,
}

static mut MAP: Lazy<HashMap<u32, TexInfo>> = Lazy::new(|| HashMap::new());

pub fn save_buffer(id: u32, buf: &[u8], width: usize, height: usize) {
    unsafe {
        MAP.insert(
            id,
            TexInfo {
                buf: buf.to_vec(),
                width,
                height,
            },
        );
    }
}

pub fn get_buffer(id: u32) -> Option<&'static TexInfo> {
    unsafe { MAP.get(&id) }
}
