mod gl;
mod grabber;

use grabber::Grabber;

fn main() {
    let grabber0 = Grabber::new(0);
    let grabber1 = Grabber::new(1);
    grabber0.start();
    std::thread::spawn(move || grabber1.start());

    let app = gl::GLApp::new();
    app.run();
}
