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
import ReactDOM from 'react-dom';

// Default styles that can be overridden by your app
require('@solana/wallet-adapter-react-ui/styles.css');

const WalletProviderComponent: FC = () => {
    // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
    const network = WalletAdapterNetwork.Mainnet;

    // You can provide a custom RPC endpoint
    const endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new LedgerWalletAdapter(),
        ],
        [network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <div className="wallet-buttons">
                        <WalletMultiButton />
                        <WalletDisconnectButton />
                    </div>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
};

// Create a wrapper to render the component
const renderWalletProvider = () => {
    const container = document.getElementById('root');
    if (container) {
        ReactDOM.render(<WalletProviderComponent />, container);
    }
};

// Expose the render function to the global scope
(window as any).WalletProvider = {
    render: renderWalletProvider
};

export default WalletProviderComponent;