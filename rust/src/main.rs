mod gl;
mod grabber;
mod store;

use grabber::{define_delegate, Grabber};

fn main() {
    define_delegate();

    Grabber::new(0).start();
    Grabber::new(1).start();
    Grabber::new(2).start();

    let app = gl::GLApp::new();
    app.run().unwrap();
}
