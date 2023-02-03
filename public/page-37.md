# キャプチャしたデータをRust側に渡して……


```rust
extern "C" fn capture_stream(
    _this: &mut Object,
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
        let delegate_id: u32 = *_this.get_ivar("_delegate_id");

        if width != 0 && height != 0 {
            let slice = std::slice::from_raw_parts(ptr, width * height * 4);
            store::save_buffer(delegate_id, slice, width, height); // ここ
        }

        ffi::CVPixelBufferUnlockBaseAddress(pixel_buffer, 1);
    }
}
decl.add_method(
    sel!(stream:didOutputSampleBuffer:ofType:),
    capture_stream as extern "C" fn(&mut Object, _, id, id, NSInteger),
);
```
