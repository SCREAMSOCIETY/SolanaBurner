use yew::prelude::*;
use web_sys::HtmlInputElement;
use wasm_bindgen::JsCast;

pub struct BurnForm {
    amount: String,
    status: Option<String>,
    loading: bool,
}

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
                if self.amount.parse::<f64>().is_ok() {
                    self.loading = true;
                    // Simulate burn transaction
                    let link = ctx.link().clone();
                    wasm_bindgen_futures::spawn_local(async move {
                        // In real implementation, this would call Solana program
                        link.send_message(Msg::TransactionComplete(
                            "Transaction successful!".to_string()
                        ));
                    });
                } else {
                    self.status = Some("Invalid amount".to_string());
                }
                true
            }
            Msg::TransactionComplete(signature) => {
                self.loading = false;
                self.status = Some(signature);
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
            <form class="burn-form" onsubmit={onsubmit}>
                <div class="input-group">
                    <label for="amount">{"Amount to Burn:"}</label>
                    <input
                        type="number"
                        id="amount"
                        value={self.amount.clone()}
                        {oninput}
                        disabled={self.loading}
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
                    <div class="status-message">
                        {status}
                    </div>
                }
            </form>
        }
    }
}
