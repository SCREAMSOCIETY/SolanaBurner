import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from 'react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter, SolflareWalletAdapter, BackpackWalletAdapter, TorusWalletAdapter, LedgerWalletAdapter, } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton, WalletDisconnectButton } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
// Default styles that can be overridden by your app
require('@solana/wallet-adapter-react-ui/styles.css');
export var WalletProvider = function () {
    // Can be set to 'devnet', 'testnet', or 'mainnet-beta'
    var network = WalletAdapterNetwork.MainnetBeta;
    // You can provide a custom RPC endpoint
    var endpoint = process.env.QUICKNODE_RPC_URL || clusterApiUrl(network);
    var wallets = useMemo(function () {
        return [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
            new BackpackWalletAdapter(),
            new TorusWalletAdapter(),
            new LedgerWalletAdapter(),
        ];
    }, [network]);
    return (_jsx(ConnectionProvider, { endpoint: endpoint, children: _jsx(SolanaWalletProvider, { wallets: wallets, autoConnect: true, children: _jsx(WalletModalProvider, { children: _jsxs("div", { className: "wallet-buttons", children: [_jsx(WalletMultiButton, {}), _jsx(WalletDisconnectButton, {})] }) }) }) }));
};
export default WalletProvider;
