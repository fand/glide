use std::ptr::{null, null_mut};

use block::ConcreteBlock;
use cacao::{
    button::Button,
    core_graphics::display::{CGPoint, CGRect, CGSize},
    foundation::{id, NSInteger, NSString},
    layout::{Layout, LayoutConstraint},
    macos::{
        window::{Window, WindowConfig},
        App, AppDelegate,
    },
    view::{View, ViewDelegate},
};
use objc::{
    declare::ClassDecl,
    runtime::{Class, Object, Sel},
};
use once_cell::sync::{Lazy, OnceCell};
#[macro_use]
extern crate objc;

struct GlideCapture {
    window: Window,
    content: View<GrabberView>,
}

impl AppDelegate for GlideCapture {
    fn did_finish_launching(&self) {
        self.window.set_minimum_content_size(400., 400.);
        self.window.set_title("A Basic Window");
        self.window.set_content_view(&self.content);

        self.window.show();
    }
}

static CAPTURE_DELEGATE0: OnceCell<&'static Class> = OnceCell::new();
static CAPTURE_DELEGATE1: OnceCell<&'static Class> = OnceCell::new();

static GRABBER0: Lazy<Grabber> = Lazy::new(|| Grabber::new(0));
static GRABBER1: Lazy<Grabber> = Lazy::new(|| Grabber::new(1));

fn start() {
    GRABBER0.start();
    std::thread::spawn(|| GRABBER1.start());
}

struct GrabberView {
    button: Button,
}

impl GrabberView {
    fn new() -> Self {
        let mut button = Button::new("Start");
        button.set_action(start);

        Self { button }
    }
}

impl ViewDelegate for GrabberView {
    const NAME: &'static str = "GrabberView";

    fn did_load(&mut self, view: View) {
        view.add_subview(&self.button);

        LayoutConstraint::activate(&[self.button.top.constraint_equal_to(&view.top).offset(36.)]);
    }
}

struct Grabber {
    instance_id: u32,
}

unsafe impl Sync for Grabber {}
unsafe impl Send for Grabber {}

fn obj_to_string(ptr: *mut Object, default: &str) -> String {
    if ptr.is_null() {
        default.to_string()
    } else {
        NSString::from_retained(ptr).to_string()
    }
}

fn filter_windows(windows: id) -> id {
    let out: id = unsafe { msg_send![class!(NSMutableArray), array] };

    let window_count: u64 = unsafe { msg_send![windows, count] };
    for i in 0..window_count {
        let w: id = unsafe { msg_send![windows, objectAtIndex: i] };

        let owning_app: id = unsafe { msg_send![w, owningApplication] };
        if owning_app.is_null() {
            continue;
        }

        let _: () = unsafe { msg_send![out, addObject: w] };
    }

    let out: id = unsafe { msg_send![out, copy] };
    out
}

impl Grabber {
    fn new(instance_id: u32) -> Grabber {
        Self { instance_id }
    }

    fn start(&self) {
        let instance_id = self.instance_id;
        let app_pattern = if instance_id == 0 {
            "Google Chrome"
        } else {
            "Slack"
        };

        let block = ConcreteBlock::new(move |shareable_content: id, _err: id| {
            if instance_id == 0 {
                CAPTURE_DELEGATE0.get_or_init(|| {
                    let mut decl =
                        ClassDecl::new("ScreenCaptureDelegate0", class!(NSObject)).unwrap();
                    unsafe {
                        decl.add_method(
                            sel!(stream:didOutputSampleBuffer:ofType:),
                            capture_stream0 as extern "C" fn(&Object, _, id, id, NSInteger),
                        );
                    }
                    decl.register()
                });
            } else {
                CAPTURE_DELEGATE1.get_or_init(|| {
                    let mut decl =
                        ClassDecl::new("ScreenCaptureDelegate1", class!(NSObject)).unwrap();
                    unsafe {
                        decl.add_method(
                            sel!(stream:didOutputSampleBuffer:ofType:),
                            capture_stream1 as extern "C" fn(&Object, _, id, id, NSInteger),
                        );
                    }
                    decl.register()
                });
            }

            let windows: id = unsafe { msg_send![shareable_content, windows] };
            let windows = filter_windows(windows);

            let mut window: id = unsafe { msg_send![windows, objectAtIndex:0] };

            let window_count: u64 = unsafe { msg_send![windows, count] };
            for i in 0..(window_count) {
                let w: id = unsafe { msg_send![windows, objectAtIndex: i] };

                let owning_app: id = unsafe { msg_send![w, owningApplication] };
                let owning_app_name = if owning_app.is_null() {
                    "NO_APP".to_string()
                } else {
                    obj_to_string(
                        unsafe { msg_send![owning_app, applicationName] },
                        "UNKNOWN_APP",
                    )
                };

                let title = obj_to_string(unsafe { msg_send![w, title] }, "NO TITLE");
                println!(">> window {}: {} - {}", i, owning_app_name, title);

                if owning_app_name.contains(app_pattern) {
                    window = w;
                }
            }

            // Get window size
            let f: CGRect = unsafe { msg_send![window, frame] };
            let width = f.size.width;
            let height = f.size.height;
            println!(">>>>> window size: {} x {}", width, height);

            println!(">> create filter");
            let filter: id = unsafe {
                let filter: id = msg_send![class!(SCContentFilter), alloc];
                let _: () = msg_send![filter, initWithDesktopIndependentWindow: window];
                filter
            };

            println!(">> create stream config");
            let stream_config: id = unsafe {
                let stream_config: id = msg_send![class!(SCStreamConfiguration), alloc];
                let stream_config: id = msg_send![stream_config, init];

                let _: () = msg_send![stream_config, setWidth:(width as u32)];
                let _: () = msg_send![stream_config, setHeight:(height as u32)];
                // let _: () = msg_send![stream_config, setQueueDepth:0];

                let source_rect = CGRect::new(
                    &CGPoint::new(width / 2., height / 2.),
                    &CGSize::new(width, height),
                );
                let destination_rect =
                    CGRect::new(&CGPoint::new(0., 0.), &CGSize::new(width, height));
                let _: () = msg_send![stream_config, setSourceRect: source_rect];
                let _: () = msg_send![stream_config, setDestinationRect: destination_rect];

                // let _: () = msg_send![stream_config, setShowCursor: false];

                #[allow(non_upper_case_globals)]
                const kCVPixelFormatType_32BGRA: u32 = 1111970369;
                let _: () = msg_send![stream_config, setPixelFormat: kCVPixelFormatType_32BGRA];

                stream_config
            };

            println!(">> create stream");
            let stream: id = unsafe {
                let stream: id = msg_send![class!(SCStream), alloc];
                let stream: id = msg_send![stream, init];
                let _: () = msg_send![stream, initWithFilter:filter configuration:stream_config delegate:null::<id>()];
                stream
            };

            println!(">> create delegate");
            let delegate: id = unsafe {
                let delegate: id = if instance_id == 0 {
                    msg_send![class!(ScreenCaptureDelegate0), alloc]
                } else {
                    msg_send![class!(ScreenCaptureDelegate1), alloc]
                };
                msg_send![delegate, init]
            };
            let error: id = null_mut();
            let did_add_output: bool = unsafe {
                println!(">> did_add_output!");
                msg_send![stream, addStreamOutput:delegate type:0 sampleHandlerQueue:null::<id>() error:&error]
            };
            assert!(did_add_output);

            println!(">> create completion ahndler");
            let block = ConcreteBlock::new(move |err: id| {
                println!(">> error: {:?}", err);
                assert!(err.is_null());
            });

            println!(">> start capture");
            let _: () = unsafe { msg_send![stream, startCaptureWithCompletionHandler: block] };
        });

        let block = block.copy();
        unsafe {
            let _: () = msg_send![
                class!(SCShareableContent),
                // getShareableContentWithCompletionHandler: block
                getShareableContentExcludingDesktopWindows: true
                onScreenWindowsOnly: true
                completionHandler: block
            ];
        }
    }
}

mod ffi {
    use std::ffi::c_void;

    use cacao::foundation::id;

    #[repr(C)]
    pub struct __CVBuffer(c_void);

    pub type CVBufferRef = *mut __CVBuffer;
    pub type CVImageBufferRef = CVBufferRef;
    pub type CVPixelBufferRef = CVImageBufferRef;

    pub type CVOptionFlags = u64;

    pub type CVReturn = i32;

    #[link(name = "CoreVideo", kind = "framework")]
    extern "C" {
        pub fn CVPixelBufferLockBaseAddress(
            pixelBuffer: CVPixelBufferRef,
            lockFlags: CVOptionFlags,
        ) -> CVReturn;
        pub fn CVPixelBufferUnlockBaseAddress(
            pixelBuffer: CVPixelBufferRef,
            unlockFlags: CVOptionFlags,
        ) -> CVReturn;
        pub fn CVPixelBufferGetBaseAddress(pixelBuffer: CVPixelBufferRef) -> *mut c_void;
        pub fn CVPixelBufferGetWidth(pixelBuffer: CVPixelBufferRef) -> usize;
        pub fn CVPixelBufferGetHeight(pixelBuffer: CVPixelBufferRef) -> usize;
    }

    #[link(name = "CoreMedia", kind = "framework")]
    extern "C" {
        pub fn CMSampleBufferGetImageBuffer(buffer: id) -> id;
    }
}

static mut FRAME_COUNT_0: u32 = 0;
static mut FRAME_COUNT_1: u32 = 0;

extern "C" fn capture_stream0(
    _this: &Object,
    _: Sel,
    _stream: id,
    sample_buffer: id,
    _typ: NSInteger,
) {
    let pixel_buffer: id = unsafe { ffi::CMSampleBufferGetImageBuffer(sample_buffer) };
    let pixel_buffer = pixel_buffer as ffi::CVBufferRef;
    let width = unsafe { ffi::CVPixelBufferGetWidth(pixel_buffer) };
    let height = unsafe { ffi::CVPixelBufferGetHeight(pixel_buffer) };

    unsafe {
        ffi::CVPixelBufferLockBaseAddress(pixel_buffer, 1);
        let ptr = ffi::CVPixelBufferGetBaseAddress(pixel_buffer) as *mut u8;

        println!(
            ">> captured 0: {}th: ({}, {})",
            FRAME_COUNT_0, width, height
        );
        FRAME_COUNT_0 += 1;

        if FRAME_COUNT_0 % 10 == 0 && width != 0 && height != 0 {
            let slice = std::slice::from_raw_parts(ptr, width * height * 4);

            image::save_buffer_with_format(
                format!("img-0-{}.png", FRAME_COUNT_0),
                slice,
                width as u32,
                height as u32,
                image::ColorType::Rgba8,
                image::ImageFormat::Png,
            )
            .expect("failed to save image");
        }

        ffi::CVPixelBufferUnlockBaseAddress(pixel_buffer, 1);
    }
}

extern "C" fn capture_stream1(
    _this: &Object,
    _: Sel,
    _stream: id,
    sample_buffer: id,
    _typ: NSInteger,
) {
    let pixel_buffer: id = unsafe { ffi::CMSampleBufferGetImageBuffer(sample_buffer) };
    let pixel_buffer = pixel_buffer as ffi::CVBufferRef;
    let width = unsafe { ffi::CVPixelBufferGetWidth(pixel_buffer) };
    let height = unsafe { ffi::CVPixelBufferGetHeight(pixel_buffer) };

    unsafe {
        ffi::CVPixelBufferLockBaseAddress(pixel_buffer, 1);
        let ptr = ffi::CVPixelBufferGetBaseAddress(pixel_buffer) as *mut u8;

        println!(
            ">> captured 1: {}th: ({}, {})",
            FRAME_COUNT_1, width, height
        );
        FRAME_COUNT_1 += 1;

        if FRAME_COUNT_1 % 10 == 0 && width != 0 && height != 0 {
            let slice = std::slice::from_raw_parts(ptr, width * height * 4);

            image::save_buffer_with_format(
                format!("img-1-{}.png", FRAME_COUNT_1),
                slice,
                width as u32,
                height as u32,
                image::ColorType::Rgba8,
                image::ImageFormat::Png,
            )
            .expect("failed to save image");
        }

        ffi::CVPixelBufferUnlockBaseAddress(pixel_buffer, 1);
    }
}

fn main() {
    let mut config = WindowConfig::default();
    config.set_initial_dimensions(0., 000., 800., 800.);

    App::new(
        "com.amagi.glide_capture",
        GlideCapture {
            window: Window::new(config),
            content: View::with(GrabberView::new()),
        },
    )
    .run();
}
