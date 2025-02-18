use yew::prelude::*;
use wasm_bindgen::prelude::*;
use web_sys::Window;
use js_sys::Object;
use wasm_bindgen::JsCast;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = window)]
    fn solana() -> JsValue;

    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

pub struct WalletConnect {
    connected: bool,
    pub_key: Option<String>,
    on_connect: Callback<bool>,
}

pub enum Msg {
    Connect,
    Connected(bool, Option<String>),
    Error(String),
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
            pub_key: None,
            on_connect: ctx.props().on_connect.clone(),
        }
    }

    fn update(&mut self, ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::Connect => {
                let link = ctx.link().clone();
                wasm_bindgen_futures::spawn_local(async move {
                    let window = web_sys::window().unwrap();
                    if let Some(phantom) = js_sys::Reflect::get(
                        &window,
                        &JsValue::from_str("solana")
                    ).ok() {
                        if let Ok(connect_result) = js_sys::Reflect::get(
                            &phantom,
                            &JsValue::from_str("connect")
                        ) {
                            if let Some(func) = connect_result.dyn_ref::<js_sys::Function>() {
                                if let Ok(_) = func.call0(&phantom) {
                                    let pub_key = js_sys::Reflect::get(
                                        &phantom,
                                        &JsValue::from_str("publicKey")
                                    ).ok()
                                    .and_then(|key| key.as_string());

                                    link.send_message(Msg::Connected(true, pub_key));
                                }
                            }
                        }
                    } else {
                        link.send_message(Msg::Error("Phantom wallet not found".to_string()));
                    }
                });
                false
            }
            Msg::Connected(status, key) => {
                self.connected = status;
                self.pub_key = key;
                self.on_connect.emit(status);
                true
            }
            Msg::Error(_) => {
                self.connected = false;
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
                        {"Connect Phantom"}
                    </button>
                } else {
                    <div class="connected-status">
                        {"Wallet Connected"}
                        if let Some(key) = &self.pub_key {
                            <div class="wallet-address">
                                {format!("Address: {}...{}", &key[..6], &key[key.len()-6..])}
                            </div>
                        }
                    </div>
                }
            </div>
        }
    }
}