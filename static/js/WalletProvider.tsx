import React, { FC, useMemo, useState, useEffect } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
    ConnectionProvider,
    WalletProvider as SolanaWalletProvider,
    useWallet
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

    // Fetch RPC endpoint from window for client-side access
    const [endpoint, setEndpoint] = useState<string>(clusterApiUrl(network));
    
    // Effect to fetch the RPC URL from the API
    useEffect(() => {
        console.log('[WalletProvider] Fetching RPC config');
        fetch('/api/config')
            .then(response => response.json())
            .then(data => {
                if (data.quicknodeRpcUrl) {
                    console.log('[WalletProvider] Using QuickNode RPC endpoint');
                    setEndpoint(data.quicknodeRpcUrl);
                } else {
                    console.log('[WalletProvider] Using public RPC endpoint:', network);
                    setEndpoint(clusterApiUrl(network));
                }
            })
            .catch(error => {
                console.error('[WalletProvider] Error fetching config:', error);
                console.log('[WalletProvider] Falling back to public RPC');
                setEndpoint(clusterApiUrl(network));
            });
    }, [network]);

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
            <SolanaWalletProvider 
                wallets={wallets} 
                autoConnect
                onError={(error) => {
                    console.error('[WalletProvider] Wallet adapter error:', error);
                    if (typeof window !== 'undefined' && window.debugInfo) {
                        window.debugInfo.lastCnftError = `Wallet adapter error: ${error.message}`;
                    }
                }}
            >
                <WalletModalProvider>
                    <WalletLogger />
                    <div className="wallet-container">
                        <div className="wallet-buttons">
                            <WalletMultiButton />
                            <WalletDisconnectButton style={{ marginLeft: '10px' }} />
                        </div>
                        {children}
                    </div>
                </WalletModalProvider>
            </SolanaWalletProvider>
        </ConnectionProvider>
    );
};

// Component to log wallet state changes and capture them for debugging
const WalletLogger: FC = () => {
    const wallet = useWallet();
    
    useEffect(() => {
        console.log('[WalletLogger] Wallet state updated:', {
            connected: wallet.connected,
            publicKey: wallet.publicKey?.toString() || 'none',
            adapterName: wallet.wallet?.adapter.name || 'none',
            readyState: wallet.wallet?.adapter.readyState
        });
        
        if (typeof window !== 'undefined' && window.debugInfo) {
            window.debugInfo.walletInfo = {
                connected: wallet.connected,
                publicKey: wallet.publicKey?.toString() || 'none',
                adapterName: wallet.wallet?.adapter.name || 'none',
                readyState: wallet.wallet?.adapter.readyState,
                hasSignTransaction: !!wallet.signTransaction
            };
        }
    }, [
        wallet.connected, 
        wallet.publicKey, 
        wallet.wallet, 
        wallet.signTransaction
    ]);
    
    return null;
};

export default WalletProvider;