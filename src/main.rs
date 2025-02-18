use wasm_bindgen::prelude::*;
use yew::prelude::*;
mod app;
mod components;
mod utils;

#[wasm_bindgen(start)]
pub fn run_app() -> Result<(), JsValue> {
    yew::start_app::<app::App>();
    Ok(())
}

fn main() {
    // This file exists to satisfy cargo, but the actual entry point is in lib.rs
    println!("Use `trunk serve` to run the web application");
}