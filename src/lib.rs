use wasm_bindgen::prelude::*;
use yew::prelude::*;
mod app;
mod components;
mod utils;

#[wasm_bindgen(start)]
pub fn run_app() -> Result<(), JsValue> {
    std::panic::set_hook(Box::new(console_error_panic_hook::hook));
    wasm_logger::init(wasm_logger::Config::default());
    yew::Renderer::<app::App>::new().render();
    Ok(())
}