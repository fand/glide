mod gl;
mod grabber;

use std::{cell::RefCell, rc::Rc};

use grabber::{define_delegate, Grabber};

fn main() {
    define_delegate();

    let r1 = Rc::new(RefCell::new(vec![0u8]));
    let r2 = Rc::new(RefCell::new(vec![0u8]));

    let grabber0 = Grabber::new(0, r1);
    let grabber1 = Grabber::new(1, r2);
    grabber0.start();
    grabber1.start();

    let app = gl::GLApp::new();
    app.run();
}
