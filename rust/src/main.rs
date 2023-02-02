mod gl;
mod grabber;

use grabber::{define_delegate, Grabber};

fn main() {
    define_delegate();

    let grabber0 = Grabber::new(0);
    let grabber1 = Grabber::new(1);
    grabber0.start();
    grabber1.start();

    let app = gl::GLApp::new();
    app.run();
}
