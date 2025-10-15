use yew::prelude::*;
use web_sys::HtmlInputElement;
use wasm_bindgen::JsCast;
use js_sys::{Object, Reflect};
use wasm_bindgen::prelude::*;

pub struct BurnForm {
    amount: String,
    status: Option<String>,
    loading: bool,
}

//yooo
pub enum Msg {
    UpdateAmount(String),
    Burn,
    TransactionComplete(String),
    Error(String),
}

impl Component for BurnForm {
    type Message = Msg;
    type Properties = ();

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            amount: String::new(),
            status: None,
            loading: false,
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::UpdateAmount(amount) => {
                self.amount = amount;
                true
            }
            Msg::Burn => {
                if let Ok(amount) = self.amount.parse::<f64>() {
                    if amount <= 0.0 {
                        self.status = Some("Amount must be greater than 0".to_string());
                        return true;
                    }

                    self.loading = true;
                    let amount_str = self.amount.clone();
                    let link = ctx.link().clone();

                    wasm_bindgen_futures::spawn_local(async move {
                        let window = web_sys::window().unwrap();
                        if let Ok(solana) = js_sys::Reflect::get(&window, &JsValue::from_str("solana")) {
                            if let Ok(burn_tokens) = js_sys::Reflect::get(&solana, &JsValue::from_str("burnTokens")) {
                                if let Some(func) = burn_tokens.dyn_ref::<js_sys::Function>() {
                                    match func.call1(&solana, &JsValue::from_str(&amount_str)) {
                                        Ok(_) => {
                                            link.send_message(Msg::TransactionComplete(
                                                format!("Successfully burned {} tokens", amount_str)
                                            ));
                                        }
                                        Err(_) => {
                                            link.send_message(Msg::Error("Failed to burn tokens".to_string()));
                                        }
                                    }
                                }
                            }
                        }
                    });
                } else {
                    self.status = Some("Invalid amount".to_string());
                }
                true
            }
            Msg::TransactionComplete(signature) => {
                self.loading = false;
                self.status = Some(signature);
                self.amount = String::new();
                true
            }
            Msg::Error(error) => {
                self.loading = false;
                self.status = Some(error);
                true
            }
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let oninput = ctx.link().callback(|e: InputEvent| {
            let input: HtmlInputElement = e.target().unwrap().dyn_into().unwrap();
            Msg::UpdateAmount(input.value())
        });

        let onsubmit = ctx.link().callback(|e: FocusEvent| {
            e.prevent_default();
            Msg::Burn
        });

        html! {
            <form class="burn-form" {onsubmit}>
                <div class="input-group">
                    <label for="amount">{"Amount to Burn:"}</label>
                    <input
                        type="number"
                        id="amount"
                        value={self.amount.clone()}
                        {oninput}
                        disabled={self.loading}
                        step="0.000001"
                        min="0"
                    />
                </div>
                <button type="submit" disabled={self.loading}>
                    if self.loading {
                        {"Processing..."}
                    } else {
                        {"Burn Tokens"}
                    }
                </button>
                if let Some(status) = &self.status {
                    <div class={if status.contains("Success") { "status-message success" } else { "status-message error" }}>
                        {status}
                    </div>
                }
            </form>
        }
    }
}
