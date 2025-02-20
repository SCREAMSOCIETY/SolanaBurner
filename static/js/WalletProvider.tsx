import React, { FC, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
    ConnectionProvider,
    WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
    LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import {
    WalletModalProvider,
    WalletMultiButton,
    WalletDisconnectButton
} from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const App: FC = () => {
    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = WalletAdapterNetwork.Mainnet;

    // You can also provide a custom RPC endpoint.
    const endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new LedgerWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <div className="wallet-container">
                        <h1>Solana Asset Manager</h1>
                        <div className="wallet-buttons">
                            <WalletMultiButton className="wallet-button" />
                            <WalletDisconnectButton className="wallet-button" />
                        </div>
                    </div>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
};

declare global {
    interface Window {
        WalletProvider: {
            render: () => void;
        };
    }
}

function initWalletProvider() {
    console.log('Initializing WalletProvider...');
    const container = document.getElementById('root');
    if (!container) {
        throw new Error('Root element not found');
    }

    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
    console.log('WalletProvider initialized successfully');
}

// Export for webpack
window.WalletProvider = {
    render: initWalletProvider
};