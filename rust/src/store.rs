use std::collections::HashMap;

use once_cell::sync::Lazy;

static mut MAP: Lazy<HashMap<u32, Vec<u8>>> = Lazy::new(|| HashMap::new());

pub fn save_buffer(id: u32, buf: &[u8]) {
    unsafe {
        MAP.insert(id, buf.to_vec());
    }
}

pub fn get_buffer(id: u32) -> Option<&'static Vec<u8>> {
    unsafe { MAP.get(&id) }
}
