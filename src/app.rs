use yew::prelude::*;
use crate::components::{wallet::WalletConnect, burn_form::BurnForm};

pub struct App {
    wallet_connected: bool,
}

pub enum Msg {
    WalletConnected(bool),
}

impl Component for App {
    type Message = Msg;
    type Properties = ();

    fn create(_ctx: &Context<Self>) -> Self {
        Self {
            wallet_connected: false,
        }
    }

    fn update(&mut self, _ctx: &Context<Self>, msg: Self::Message) -> bool {
        match msg {
            Msg::WalletConnected(status) => {
                self.wallet_connected = status;
                true
            }
        }
    }

    fn view(&self, ctx: &Context<Self>) -> Html {
        let wallet_callback = ctx.link().callback(Msg::WalletConnected);
        
        html! {
            <div class="container">
                <h1>{"Solana Token Burner"}</h1>
                <WalletConnect on_connect={wallet_callback.clone()} />
                if self.wallet_connected {
                    <BurnForm />
                }
            </div>
        }
    }
}
