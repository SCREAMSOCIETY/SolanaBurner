import React, { FC, useMemo } from 'react';
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
import * as ReactDOM from 'react-dom/client';

// Default styles that can be overridden by your app
import '@solana/wallet-adapter-react-ui/styles.css';

const WalletProviderComponent: FC = () => {
    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = WalletAdapterNetwork.Mainnet;

    // You can also provide a custom RPC endpoint.
    const endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);
    console.log('Using RPC endpoint:', endpoint);

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

// Create a self-contained initialization function
const initializeWalletProvider = () => {
    const container = document.getElementById('root');
    if (!container) {
        console.error('Root element not found');
        return;
    }

    try {
        const root = ReactDOM.createRoot(container);
        root.render(
            <React.StrictMode>
                <WalletProviderComponent />
            </React.StrictMode>
        );
        console.log('WalletProvider rendered successfully');
    } catch (error) {
        console.error('Failed to render WalletProvider:', error);
    }
};

// Export for webpack
export { WalletProviderComponent, initializeWalletProvider };
// Default export for UMD
export default { render: initializeWalletProvider };