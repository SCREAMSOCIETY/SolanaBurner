use yew::prelude::*;
use wasm_bindgen::prelude::*;
use web_sys::Window;

pub struct WalletConnect {
    connected: bool,
    phantom_wallet: Option<JsValue>,
    on_connect: Callback<bool>,
}

pub enum Msg {
    Connect,
    Connected(bool),
}

#[derive(Properties, PartialEq)]
pub struct Props {
    pub on_connect: Callback<bool>,
}

impl Component for WalletConnect {
    type Message = Msg;
    type Properties = Props;

    fn create(ctx: &Context<Self>) -> Self {
        Self {
            connected: false,
            phantom_wallet: None,
            on_connect: ctx.props().on_connect.clone(),
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::Connect => {
                // In a real implementation, this would connect to Phantom wallet
                self.connected = true;
                self.on_connect.emit(true);
                true
            }
            Msg::Connected(status) => {
                self.connected = status;
                self.on_connect.emit(status);
                true
            }
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let onclick = ctx.link().callback(|_| Msg::Connect);
        
        html! {
            <div class="wallet-section">
                if !self.connected {
                    <button class="connect-button" {onclick}>
                        {"Connect Wallet"}
                    </button>
                } else {
                    <div class="connected-status">
                        {"Wallet Connected"}
                    </div>
                }
            </div>
        }
    }
}
