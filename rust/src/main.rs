mod gl;
mod grabber;
mod store;

use std::{cell::RefCell, rc::Rc};

use grabber::{define_delegate, Grabber};

fn main() {
    define_delegate();

    let r1 = Rc::new(RefCell::new(0));
    let r2 = Rc::new(RefCell::new(0));

    let grabber0 = Grabber::new(0);
    let grabber1 = Grabber::new(1);
    grabber0.start();
    grabber1.start();

    let app = gl::GLApp::new();
    app.run();
}
