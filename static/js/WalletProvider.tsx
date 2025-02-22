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
import { clusterApiUrl, Connection } from '@solana/web3.js';

// Default styles that can be overridden by your app
require('@solana/wallet-adapter-react-ui/styles.css');

interface Props {
  children?: React.ReactNode;
}

export const WalletProvider: FC<Props> = ({ children }) => {
    console.log('WalletProvider component initializing');

    // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
    const network = WalletAdapterNetwork.Mainnet;

    // You can also provide a custom RPC endpoint.
    const endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);
    console.log('Using endpoint:', endpoint.split('?')[0]); // Log endpoint without query params for security

    // Initialize Solana connection
    const connection = useMemo(() => {
        console.log('Creating Solana connection to:', network);
        try {
            const conn = new Connection(endpoint, 'confirmed');
            console.log('Solana connection created successfully');
            return conn;
        } catch (error) {
            console.error('Error creating Solana connection:', error);
            // Fallback to public RPC
            console.log('Falling back to public RPC endpoint');
            return new Connection(clusterApiUrl(network), 'confirmed');
        }
    }, [endpoint]);

    const wallets = useMemo(
        () => {
            console.log('Initializing wallet adapters');
            return [
                new PhantomWalletAdapter(),
                new SolflareWalletAdapter(),
                new LedgerWalletAdapter(),
            ];
        },
        []
    );

    console.log('Rendering WalletProvider component structure');
    return (
        <ConnectionProvider endpoint={endpoint}>
            <SolanaWalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <div className="wallet-container">
                        <div className="wallet-buttons">
                            <WalletMultiButton />
                            <WalletDisconnectButton />
                        </div>
                        {children}
                    </div>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
};

export default WalletProvider;