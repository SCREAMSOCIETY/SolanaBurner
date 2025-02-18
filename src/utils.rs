use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn format_transaction_signature(signature: &str) -> String {
    format!("{}...{}", &signature[0..6], &signature[signature.len()-6..])
}

#[wasm_bindgen]
pub fn validate_amount(amount: f64) -> bool {
    amount > 0.0
}
