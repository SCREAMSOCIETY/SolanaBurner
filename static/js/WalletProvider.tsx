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
import { clusterApiUrl, Connection } from '@solana/web3.js';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

declare global {
    interface Window {
        WalletProvider: {
            render: () => void;
        };
    }
}

const App: FC = () => {
    console.log('Rendering App component');

    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = WalletAdapterNetwork.Mainnet;

    // You can also provide a custom RPC endpoint.
    const endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);
    console.log('Using endpoint:', endpoint);

    // Initialize Solana connection
    const connection = useMemo(() => new Connection(endpoint), [endpoint]);

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
                            <WalletMultiButton />
                            <WalletDisconnectButton />
                        </div>
                    </div>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
};

const initWalletProvider = () => {
    try {
        console.log('Starting WalletProvider initialization');
        const container = document.getElementById('root');
        if (!container) {
            throw new Error('Root element not found');
        }

        console.log('Creating React root');
        const root = createRoot(container);

        console.log('Rendering App component');
        root.render(
            <React.StrictMode>
                <App />
            </React.StrictMode>
        );
        console.log('WalletProvider initialized successfully');
    } catch (error) {
        console.error('Error initializing WalletProvider:', error);
        if (error instanceof Error) {
            console.error('Error details:', error.message);
            console.error('Stack trace:', error.stack);
        }
    }
};

// Export to window object for script tag access
window.WalletProvider = {
    render: initWalletProvider
};