import React, { useState, useEffect, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createBurnCheckedInstruction, 
  createCloseAccountInstruction
} from '@solana/spl-token';
import axios from 'axios';

// Import the CNFTHandler class
import { CNFTHandler } from '../cnft-handler';

// Import the modal components
import DirectTrashModal from './DirectTrashModal';
import QueueTransferModal from './QueueTransferModal';
import DelegatedTransferModal from './DelegatedTransferModal';
import RentEstimate from './RentEstimate';

// Add global variable to global window object to access in console for debugging
declare global {
  interface Window {
    debugInfo: {
      lastCnftError: any;
      lastCnftData: any;
      cnftBurnTriggered: boolean;
      lastCnftSuccess: boolean;
      lastCnftSignature: string;
      lastCnftAssumedSuccess: boolean;
      walletInfo: any;
      cnftBurnAttempted?: boolean;
      cnftTransferAttempted?: boolean;
      bulkBurnAttempted?: boolean;
      proofFetchFailed?: boolean;
      proofFetchErrors?: string[];
      fatalProofError?: string;
      signTransactionCalled?: boolean;
      lastTransaction?: any;
      assetData?: any; 
      proofData?: any;
      burnMethod?: string;
      transferMethod?: string;
    };
    cnftHandler?: {
      CNFTHandler: any;
    };
    BurnAnimations?: {
      createConfetti: () => void;
      toggleDarkMode: () => void;
      applyBurnAnimation: (element: HTMLElement) => void;
      showAchievement: (title: string, description: string) => void;
      updateProgress: (currentVal: number, maxVal: number, level: number) => void;
      checkAchievements: (type: string, value: number) => void;
      initUIEnhancements: () => void;
      showNotification: (title: string, message: string) => void;
    };
    HiddenAssets?: {
      hideAsset: (assetId: string, assetName: string, assetType: string) => boolean;
      unhideAsset: (assetId: string) => boolean;
      isAssetHidden: (assetId: string) => boolean;
      getHiddenAssets: () => Record<string, {id: string, name: string, type: string, dateHidden: string}>;
      getHiddenAssetsCount: () => number;
      clearHiddenAssets: () => boolean;
    };
    BasicTransfer?: {
      transfer: (connection: any, wallet: any, destinationAddress: string, amount: number) => Promise<any>;
    };
  }
}

// Initialize debug object
if (typeof window !== 'undefined') {
  window.debugInfo = {
    lastCnftError: null,
    lastCnftData: null,
    cnftBurnTriggered: false,
    lastCnftSuccess: false,
    lastCnftSignature: '',
    lastCnftAssumedSuccess: false,
    walletInfo: null
  };
}

// Define asset type interfaces
interface TokenData {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  account?: string;
  selected?: boolean;
  metadataUri?: string;
}

interface NFTData {
  mint: string;
  name: string;
  image: string;
  collection?: string;
  selected?: boolean;
  metadataAddress?: string;
  tokenAddress?: string;
}

interface CNFTData {
  mint: string;  // Using mint as the identifier
  name: string;
  symbol?: string;
  image: string;
  collection?: string;
  description?: string;
  attributes?: any[];
  explorer_url?: string;
  proof?: any;
  selected?: boolean;
  compression?: {
    compressed?: boolean;
    proof?: any;
    data_hash?: string;
    creator_hash?: string;
    tree?: string;
    leafId?: number;
    leaf_id?: number;
  };
}

const WalletAssets: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  
  // State variables for assets
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [nfts, setNfts] = useState<NFTData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [cnfts, setCnfts] = useState<CNFTData[]>([]);
  
  // State variables for loading and errors
  const [tokensLoading, setTokensLoading] = useState(false);
  const [nftsLoading, setNftsLoading] = useState(false);
  const [cnftsLoading, setCnftsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Bulk burn mode - always enabled by default
  const [bulkBurnMode, setBulkBurnMode] = useState(true);
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]); 
  const [selectedNFTs, setSelectedNFTs] = useState<string[]>([]);
  const [selectedCNFTs, setSelectedCNFTs] = useState<string[]>([]);
  const [isBurning, setIsBurning] = useState(false);
  
  // Handle API key for Solscan
  const [solscanApiKey, setSolscanApiKey] = useState<string | null>(null);
  
  // State for Direct Trash Modal
  const [directTrashModalOpen, setDirectTrashModalOpen] = useState<boolean>(false);
  const [selectedCnftForTrash, setSelectedCnftForTrash] = useState<{ id: string; name: string; image?: string } | null>(null);
  
  // State for Queue Transfer Modal (for bulk transfers)
  const [queueTransferModalOpen, setQueueTransferModalOpen] = useState<boolean>(false);
  const [selectedCnftsForQueueTransfer, setSelectedCnftsForQueueTransfer] = useState<any[]>([]);
  
  // State for Delegated Transfer Modal
  const [delegatedTransferModalOpen, setDelegatedTransferModalOpen] = useState<boolean>(false);
  const [selectedCnftForDelegatedTransfer, setSelectedCnftForDelegatedTransfer] = useState<{ id: string; name: string; image?: string } | null>(null);
  
  // Fetch API key on component load
  useEffect(() => {
    // Fetch Solscan API key from our server endpoint
    const fetchApiKey = async () => {
      try {
        const response = await axios.get('/api/config');
        if (response.data && response.data.solscanApiKey) {
          console.log('[WalletAssets] API key status:', 'Present');
          setSolscanApiKey(response.data.solscanApiKey);
        } else {
          console.log('[WalletAssets] API key status:', 'Missing');
        }
      } catch (error) {
        console.error('[WalletAssets] Failed to fetch API key:', error);
      }
    };

    fetchApiKey();
  }, []);

  // Store wallet information in debug object when wallet connects
  useEffect(() => {
    if (publicKey && typeof window !== 'undefined' && window.debugInfo) {
      window.debugInfo.walletInfo = {
        publicKey: publicKey.toString(),
        hasSignTransaction: !!signTransaction
      };
      console.log('[WalletAssets] Updated wallet debug info:', window.debugInfo.walletInfo);
    }
  }, [publicKey, signTransaction]);

  // Fetch tokens when wallet connects
  useEffect(() => {
    const fetchTokens = async () => {
      const hasPublicKey = !!publicKey;
      const hasSolscanKey = !!solscanApiKey;
      
      console.log('[WalletAssets] Token fetch effect triggered', {
        hasPublicKey,
        hasSolscanKey
      });
      
      if (!publicKey) return;
      
      try {
        console.log('[WalletAssets] Starting token fetch');
        setTokensLoading(true);
        setError(null);
        
        // Use Helius API to get token accounts instead of direct RPC
        console.log('[WalletAssets] Fetching token accounts via Helius API');
        const heliusResponse = await fetch(`/api/wallet-tokens/${publicKey.toString()}`);
        
        if (!heliusResponse.ok) {
          throw new Error(`Failed to fetch tokens: ${heliusResponse.status}`);
        }
        
        const heliusData = await heliusResponse.json();
        console.log('[WalletAssets] Helius token response:', heliusData);
        
        const tokenData: TokenData[] = [];
        if (heliusData.success && heliusData.tokens) {
          for (const token of heliusData.tokens) {
            if (token.amount > 0) {
              tokenData.push({
                mint: token.mint,
                balance: token.amount,
                decimals: token.decimals,
                account: token.tokenAccount
              });
            }
          }
        }
        
        console.log('[WalletAssets] Filtered token data:', tokenData.length);
        setTokens(tokenData);
        
        // Helper function for rate-limited API calls
        const fetchWithRetry = async (mint: string, retryCount = 0): Promise<any> => {
          try {
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            
            console.log(`[WalletAssets] Fetching metadata for token ${mint} (attempt ${retryCount + 1})`);
            console.log(`[WalletAssets] Using Solscan API key: ${solscanApiKey ? 'Present (length: ' + solscanApiKey.length + ')' : 'Missing'}`);
            
            // Use our proxy endpoint instead of direct Solscan API call to avoid CORS issues
            const url = `/api/token-metadata/${mint}`;
            console.log(`[WalletAssets] Using proxy endpoint: ${url}`);
            
            const response = await axios.get(url, {
              timeout: 10000
            });
            
            console.log(`[WalletAssets] Solscan response status:`, response.status);
            console.log(`[WalletAssets] Solscan response data:`, response.data);
            
            if (!response.data?.success) {
              console.error(`[WalletAssets] Invalid response format from Solscan:`, response.data);
              throw new Error('Invalid response format');
            }
            
            return response.data;
          } catch (error: any) {
            console.error(
              `[WalletAssets] Error fetching metadata for token ${mint}:`,
              error.response?.status,
              error.response?.statusText
            );
            
            console.error(`[WalletAssets] Error details:`, error.response?.data || error.message);
            
            if (error.response?.status === 429 && retryCount < 3) {
              console.warn(`[WalletAssets] Rate limit hit for ${mint}, retrying in ${(retryCount + 1) * 1000}ms`);
              return fetchWithRetry(mint, retryCount + 1);
            }
            
            if (error.response?.status === 401) {
              console.error(`[WalletAssets] Authentication error with Solscan API. Please check your API key.`);
            }
            
            throw error;
          }
        };
        
        const batchSize = 3;
        const enrichedTokens = [];
        
        for (let i = 0; i < tokenData.length; i += batchSize) {
          const batch = tokenData.slice(i, i + batchSize);
          console.log(`[WalletAssets] Processing batch ${i / batchSize + 1}`);
          
          try {
            const batchResults = await Promise.all(
              batch.map(async (token) => {
                try {
                  const metadataResponse = await fetchWithRetry(token.mint);
                  console.log(`[WalletAssets] Metadata response for token ${token.mint}:`, metadataResponse);
                  
                  // The structure now comes directly from our token metadata service
                  const metadata = metadataResponse.data || {};
                  console.log(`[WalletAssets] Successfully enriched token ${token.mint} with metadata:`, metadata);
                  
                  return {
                    ...token,
                    symbol: metadata.symbol || token.mint.slice(0, 4),
                    name: metadata.name || `Token ${token.mint.slice(0, 8)}...`,
                    logoURI: metadata.icon || '/default-token-icon.svg',
                    // Ensure we have decimals for display
                    decimals: token.decimals || metadata.decimals || 9,
                    // Store the metadata URI for potential future use
                    metadataUri: metadata.uri || null
                  };
                } catch (error) {
                  console.warn(`[WalletAssets] Failed to fetch metadata for token ${token.mint}, using fallback data`);
                  return {
                    ...token,
                    symbol: 'Unknown',
                    name: 'Unknown Token',
                    logoURI: '/default-token-icon.svg'
                  };
                }
              })
            );
            
            enrichedTokens.push(...batchResults);
          } catch (error) {
            console.error('[WalletAssets] Error processing batch:', error);
          }
        }
        
        console.log('[WalletAssets] Token enrichment completed:', enrichedTokens.length);
        setTokens(enrichedTokens);
        setTokensLoading(false);
      } catch (err: any) {
        console.error('[WalletAssets] Error fetching tokens:', err);
        setError(`Error fetching tokens: ${err.message}`);
        setTokensLoading(false);
      }
    };
    
    fetchTokens();
  }, [publicKey, connection, solscanApiKey]);

  // Fetch all NFTs (regular + compressed) when wallet connects using Helius v0 API
  useEffect(() => {
    const fetchAllNFTs = async () => {
      if (!publicKey) return;
      
      setNftsLoading(true);
      setCnftsLoading(true);
      setError(null);
      
      try {
        console.log('[WalletAssets] Fetching all NFTs (regular + compressed) using Helius v0 API...');
        const walletAddress = publicKey.toBase58();
        
        // Use our combined Helius v0 API endpoint to fetch all NFTs at once
        const response = await axios.get(`/api/helius/wallet/nfts/${walletAddress}`);
        
        if (!response.data || !response.data.success) {
          console.error('[WalletAssets] Invalid response from Helius v0 API:', response.data);
          throw new Error('Invalid response from Helius v0 API');
        }
        
        const { regularNfts, compressedNfts } = response.data.data;
        console.log(`[WalletAssets] Found ${regularNfts.length} regular NFTs and ${compressedNfts.length} compressed NFTs via Helius v0 API`);
        
        // Regular NFTs are already in our expected format from the backend
        setNfts(regularNfts);
        setNftsLoading(false);
        
        // Filter out hidden compressed NFTs if the HiddenAssets functionality is available
        let visibleCompressedNfts = compressedNfts;
        if (typeof window !== "undefined" && window.HiddenAssets) {
          console.log('[WalletAssets] Filtering out hidden cNFTs from Helius API results');
          visibleCompressedNfts = compressedNfts.filter((cnft: CNFTData) => !window.HiddenAssets?.isAssetHidden(cnft.mint));
          
          // Log how many were filtered out
          const hiddenCount = compressedNfts.length - visibleCompressedNfts.length;
          if (hiddenCount > 0) {
            console.log(`[WalletAssets] Filtered out ${hiddenCount} hidden cNFTs from Helius API results`);
          }
        }
        
        // Set the filtered compressed NFTs
        setCnfts(visibleCompressedNfts);
        setCnftsLoading(false);
      } catch (error: any) {
        console.error('[WalletAssets] Error fetching NFTs via Helius v0 API:', error);
        
        // Fall back to separate endpoints if the combined endpoint fails
        try {
          console.log('[WalletAssets] Falling back to separate Helius API endpoints...');
          
          // Fetch regular NFTs 
          try {
            if (publicKey) {
              const address = publicKey.toBase58();
              const regularResponse = await axios.get(`/api/helius/assets/${address}`);
              
              if (regularResponse.data && regularResponse.data.success) {
                const assets = regularResponse.data.data || [];
                // Filter out compressed NFTs
                const regularNfts = assets.filter((asset: any) => !asset.compressed);
                
                console.log(`[WalletAssets] Found ${regularNfts.length} regular NFTs via fallback method`);
                
                setNfts(regularNfts);
              }
            }
          } catch (regularError) {
            console.error('[WalletAssets] Error in fallback regular NFT fetching:', regularError);
          }
          
          // Fetch compressed NFTs
          try {
            if (publicKey) {
              const address = publicKey.toBase58();
              const compressedResponse = await axios.get(`/api/helius/cnfts/${address}`);
              
              if (compressedResponse.data && compressedResponse.data.success) {
                const compressedNfts = compressedResponse.data.data || [];
                
                console.log(`[WalletAssets] Found ${compressedNfts.length} compressed NFTs via fallback method`);
                
                setCnfts(compressedNfts);
              }
            }
          } catch (compressedError) {
            console.error('[WalletAssets] Error in fallback compressed NFT fetching:', compressedError);
          }
          
          // Fall back to on-chain methods as a last resort
          if (!nfts.length) {
            await fetchNFTsOnChain();
          }
          
          if (!cnfts.length && signTransaction) {
            await fetchCNFTsWithHandler();
          }
        } catch (fallbackError: any) {
          console.error('[WalletAssets] Error in all fallback methods:', fallbackError);
          setError(`Error fetching NFTs: ${error.message}`);
        } finally {
          setNftsLoading(false);
          setCnftsLoading(false);
        }
      }
    };
    
    // On-chain fallback for regular NFTs
    const fetchNFTsOnChain = async () => {
      try {
        if (!publicKey) {
          console.warn('[WalletAssets] Cannot fetch NFTs - no wallet connected');
          return;
        }
        
        console.log('[WalletAssets] Falling back to on-chain NFT fetching...');
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );
        
        // Filter for NFTs (tokens with amount = 1 and decimals = 0)
        const nftAccounts = tokenAccounts.value.filter(
          item => {
            const tokenAmount = item.account.data.parsed.info.tokenAmount;
            return tokenAmount.amount === "1" && tokenAmount.decimals === 0;
          }
        );
        
        console.log(`[WalletAssets] Found ${nftAccounts.length} NFT accounts via on-chain method`);
        
        // Process NFTs in batches to prevent rate limiting
        const batchSize = 3;
        const processedNFTs: NFTData[] = [];
        
        for (let i = 0; i < nftAccounts.length; i += batchSize) {
          const batch = nftAccounts.slice(i, i + batchSize);
          console.log(`[WalletAssets] Processing NFT batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nftAccounts.length / batchSize)}`);
          
          const batchPromises = batch.map(async (nftAccount) => {
            try {
              const parsedInfo = nftAccount.account.data.parsed.info;
              const mintAddress = parsedInfo.mint;
              const metadataAddress = findMetadataPda(new PublicKey(mintAddress));
              
              const metadata = await connection.getAccountInfo(metadataAddress);
              if (!metadata) {
                console.log(`[WalletAssets] No metadata found for NFT: ${mintAddress}`);
                return null;
              }
              
              const metadataString = Buffer.from(metadata.data).toString();
              const uriMatch = metadataString.match(/https?:\/\/\S+/);
              
              if (!uriMatch) {
                console.log(`[WalletAssets] No URI found in metadata for NFT: ${mintAddress}`);
                return null;
              }
              
              let uri = uriMatch[0].split('\0')[0]; // Clean up null terminators
              let externalMetadata: any = {};
              
              try {
                // Fetch NFT metadata
                console.log(`[WalletAssets] Fetching NFT metadata from: ${uri}`);
                const response = await axios.get(uri);
                externalMetadata = response.data;
              } catch (error) {
                console.error(`[WalletAssets] Error fetching NFT metadata from URI: ${uri}`, error);
              }
              
              // Try to extract a name from the metadata
              const nameMatch = metadataString.match(/"name":"([^"]+)"/);
              const name = externalMetadata.name || (nameMatch ? nameMatch[1] : `NFT ${mintAddress.slice(0, 6)}`);
              
              // Extract image from external metadata
              const image = externalMetadata.image || '/default-nft-image.svg';
              
              return {
                mint: mintAddress,
                name: name,
                image: image,
                collection: externalMetadata.collection?.name || externalMetadata.collection?.family || 'Unknown Collection',
                tokenAddress: nftAccount.pubkey.toBase58(),
                metadataAddress: metadataAddress.toBase58()
              };
            } catch (error) {
              console.error('[WalletAssets] Error processing NFT:', error);
              return null;
            }
          });
          
          const batchResults = await Promise.all(batchPromises);
          processedNFTs.push(...batchResults.filter(Boolean) as NFTData[]);
          
          // Pause between batches to prevent rate limiting
          if (i + batchSize < nftAccounts.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        console.log(`[WalletAssets] Successfully processed ${processedNFTs.length} NFTs via on-chain method`);
        setNfts(processedNFTs);
      } catch (error) {
        console.error('[WalletAssets] Error in on-chain NFT fetching:', error);
        throw error;
      }
    };
    
    // CNFTHandler fallback for compressed NFTs
    const fetchCNFTsWithHandler = async () => {
      try {
        if (!publicKey) {
          console.warn('[WalletAssets] Cannot fetch cNFTs - no wallet connected');
          return;
        }
        
        console.log('[WalletAssets] Falling back to CNFTHandler method...');
        if (!signTransaction) {
          throw new Error('Wallet signTransaction capability required for CNFTHandler');
        }
        
        const cnftHandler = new CNFTHandler(connection, { publicKey, signTransaction });
        const cnftList = await cnftHandler.fetchCNFTs(publicKey.toBase58());
        
        // Filter out hidden assets if the HiddenAssets functionality is available
        let filteredCnftList = cnftList;
        if (typeof window !== "undefined" && window.HiddenAssets) {
          console.log('[WalletAssets] Filtering out hidden assets from display');
          filteredCnftList = cnftList.filter((cnft: CNFTData) => !window.HiddenAssets?.isAssetHidden(cnft.mint));
          
          // Log how many were filtered out
          const hiddenCount = cnftList.length - filteredCnftList.length;
          if (hiddenCount > 0) {
            console.log(`[WalletAssets] Filtered out ${hiddenCount} hidden cNFTs from display`);
          }
        }
        
        console.log(`[WalletAssets] Found ${cnftList.length} compressed NFTs (${filteredCnftList.length} visible) via CNFTHandler`);
        setCnfts(filteredCnftList);
      } catch (error) {
        console.error('[WalletAssets] Error in CNFTHandler method:', error);
        throw error;
      }
    };
    
    fetchAllNFTs();
  }, [publicKey, connection, signTransaction]);

  // Function to format token amount for display
  const formatTokenAmount = (balance: number, decimals: number): string => {
    const divisor = Math.pow(10, decimals);
    const formattedAmount = balance / divisor;
    return formattedAmount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: formattedAmount < 0.001 ? 8 : 4
    });
  };

  // Helper function to find metadata PDA
  function findMetadataPda(mint: PublicKey): PublicKey {
    const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        metadataProgramId.toBuffer(),
        mint.toBuffer(),
      ],
      metadataProgramId
    );
    return pda;
  }

  // Function to handle burning tokens and recover rent
  const handleBurnToken = async (token: TokenData) => {
    console.log('Burning token:', token);
    
    if (!publicKey || !signTransaction) {
      console.error('Wallet connection required for burning tokens');
      setError('Wallet connection required for burning tokens');
      return;
    }
    
    try {
      // Import ComputeBudgetProgram
      const { ComputeBudgetProgram } = require('@solana/web3.js');
      
      // Create a transaction with multiple instructions:
      // 1. Burn the token amount
      // 2. Close the token account to recover rent
      // 3. Transfer a small amount of SOL to the designated address
      const transaction = new Transaction();
      
      // Add compute budget instructions to avoid insufficient SOL errors
      // This helps avoid insufficient SOL errors for compute budget
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 200000 // Sufficient compute units for most operations
      });
      
      // Add a compute budget instruction to set a very low prioritization fee 
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1 // Minimum possible fee
      });
      
      // Add compute budget instructions to transaction
      transaction.add(modifyComputeUnits, addPriorityFee);
      
      // First add the burn instruction
      transaction.add(
        createBurnCheckedInstruction(
          new PublicKey(token.account || ''), // token account
          new PublicKey(token.mint), // mint
          publicKey, // owner
          token.balance, // amount to burn
          token.decimals // decimals
        )
      );
      
      // Then add the close account instruction to recover rent
      transaction.add(
        createCloseAccountInstruction(
          new PublicKey(token.account || ''), // token account to close
          publicKey, // destination for recovered SOL
          publicKey, // authority
          [] // multisig signers (empty in our case)
        )
      );
      
      // Add an instruction to transfer a small fee to the designated address
      // This is a very small amount of SOL (0.00004 SOL = 40,000 lamports)
      const feeAmount = 40000; // 0.00004 SOL in lamports
      const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: feeRecipient,
          lamports: feeAmount,
        })
      );
      
      // Get recent blockhash with lower fee priority
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
        commitment: 'processed' // Lower commitment level to reduce fees
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Create a timeoutPromise that rejects after 2 minutes
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<Transaction>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Transaction signing timed out or was cancelled'));
        }, 120000); // 2 minute timeout
      });
      
      try {
        // Race between the signTransaction and the timeout
        const signedTx = await Promise.race([
          signTransaction(transaction),
          timeoutPromise
        ]);
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Send the transaction with skipPreflight to avoid client-side checks
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true, // Skip preflight checks
          maxRetries: 3, // Retry a few times if needed
          preflightCommitment: 'processed' // Lower commitment level
        });
        
        console.log('Transaction sent, waiting for confirmation...');
        
        // Wait for confirmation with a custom strategy to avoid timeouts
        const confirmation = await connection.confirmTransaction({
          signature: signature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'processed'); // Use processed commitment level
        
        console.log('Confirmation result:', confirmation);
        
        if (confirmation.value.err) {
          console.error('Error confirming burn transaction:', confirmation.value.err);
          setError(`Error burning token: ${confirmation.value.err}`);
        } else {
          console.log('Token burn successful with signature:', signature);
          
          // Update the token list by removing the burnt token
          const updatedTokens = tokens.filter(t => t.mint !== token.mint);
          setTokens(updatedTokens);
          
          // Show a success message or perform any additional actions
          if (window.BurnAnimations && window.BurnAnimations.createConfetti) {
            window.BurnAnimations.createConfetti();
          }
          
          if (window.BurnAnimations && window.BurnAnimations.checkAchievements) {
            window.BurnAnimations.checkAchievements('tokens', 1);
          }
          
          // Show message about rent recovery and fee
          setError(`Successfully burned ${token.name || token.symbol || 'token'} and recovered rent to your wallet! A small donation has been sent to support the project.`);
          setTimeout(() => setError(null), 5000); // Clear message after 5 seconds
        }
      } catch (signingError: any) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Check if the error is related to user cancellation
        if (signingError.message.includes('timed out') || 
            signingError.message.includes('cancelled') ||
            signingError.message.includes('rejected') ||
            signingError.message.includes('User rejected')) {
          console.log('Transaction was cancelled by the user or timed out');
          setError('Transaction was cancelled. Please try again if you want to burn this token.');
          return;
        }
        
        // For other signing errors, rethrow
        throw signingError;
      }
    } catch (error: any) {
      console.error('Error burning token:', error);
      
      // Special handling for SOL-related errors
      const errorMessage = error.message || '';
      const isInsufficientSOLError = (
        errorMessage.includes('insufficient') || 
        errorMessage.includes('balance') ||
        errorMessage.includes('0x1') ||
        errorMessage.includes('fund')
      );
      
      const isWalletConnectionError = (
        errorMessage.includes('wallet') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('adapter')
      );
      
      if (isInsufficientSOLError) {
        setError('Transaction failed due to network fee issues. We\'ve updated the app to fix this. Please try again.');
      } else if (isWalletConnectionError) {
        setError('Wallet connection error. Please check your wallet and try again.');
      } else {
        setError(`Error burning token: ${error.message}`);
      }
    }
  };

  // Function to handle burning NFTs
  const handleBurnNFT = async (nft: NFTData) => {
    console.log('Burning NFT:', nft);
    
    if (!publicKey || !signTransaction) {
      console.error('Wallet connection required for burning NFTs');
      setError('Wallet connection required for burning NFTs');
      return;
    }
    
    try {
      // Import ComputeBudgetProgram
      const { ComputeBudgetProgram } = require('@solana/web3.js');
      
      // We need tokenAddress and metadataAddress to burn an NFT
      if (!nft.tokenAddress) {
        console.error('Token account address is required for burning NFT');
        setError('Could not find the token account for this NFT');
        return;
      }
      
      // Create a transaction to close the token account (burn the NFT)
      const transaction = new Transaction();
      
      // Add compute budget instructions to avoid insufficient SOL errors
      // This helps avoid insufficient SOL errors for compute budget
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 200000 // Sufficient compute units for most operations
      });
      
      // Add a compute budget instruction to set a very low prioritization fee 
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1 // Minimum possible fee
      });
      
      // Add compute budget instructions to transaction
      transaction.add(modifyComputeUnits, addPriorityFee);
      
      // 1. Burn the NFT token
      transaction.add(
        createBurnCheckedInstruction(
          new PublicKey(nft.tokenAddress), // token account
          new PublicKey(nft.mint), // mint
          publicKey, // owner
          1, // amount (NFTs have amount = 1)
          0 // decimals (NFTs have decimals = 0)
        )
      );
      
      // 2. If we have the metadata account, close it to get SOL back
      if (nft.metadataAddress) {
        try {
          // Create close account instruction for the metadata
          const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
          
          // Add a deleteMetadataAccount instruction to remove the metadata account
          // Note: This is a complex operation that might require custom instruction creation
          // depending on the metadata program version, for now we're leaving it out
        } catch (error) {
          console.warn('Could not add metadata account closing instruction:', error);
        }
      }
      
      // 3. Close the token account to recover rent
      transaction.add(
        createCloseAccountInstruction(
          new PublicKey(nft.tokenAddress), // token account to close
          publicKey, // destination for recovered SOL
          publicKey, // owner
          [] // multisig signers (empty in our case)
        )
      );
      
      // 4. Add an instruction to transfer a small fee to the designated address
      // This is a very small amount of SOL (0.00004 SOL = 40,000 lamports)
      const feeAmount = 40000; // 0.00004 SOL in lamports
      const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: feeRecipient,
          lamports: feeAmount,
        })
      );
      
      // Get recent blockhash with lower fee priority
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
        commitment: 'processed' // Lower commitment level to reduce fees
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Create a timeoutPromise that rejects after 2 minutes
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<Transaction>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Transaction signing timed out or was cancelled'));
        }, 120000); // 2 minute timeout
      });
      
      try {
        // Race between the signTransaction and the timeout
        const signedTx = await Promise.race([
          signTransaction(transaction),
          timeoutPromise
        ]);
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Send the transaction with skipPreflight to avoid client-side checks
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true, // Skip preflight checks
          maxRetries: 3, // Retry a few times if needed
          preflightCommitment: 'processed' // Lower commitment level
        });
        
        console.log('Transaction sent, waiting for confirmation...');
        
        // Wait for confirmation with a custom strategy to avoid timeouts
        const confirmation = await connection.confirmTransaction({
          signature: signature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'processed'); // Use processed commitment level
        
        console.log('Confirmation result:', confirmation);
      
        if (confirmation.value.err) {
          console.error('Error confirming NFT burn transaction:', confirmation.value.err);
          setError(`Error burning NFT: ${confirmation.value.err}`);
        } else {
          console.log('NFT burn successful with signature:', signature);
          
          // Update the NFTs list by removing the burnt NFT
          const updatedNfts = nfts.filter(n => n.mint !== nft.mint);
          setNfts(updatedNfts);
          
          // Apply animations if available
          if (window.BurnAnimations) {
            // Find the NFT card element for burn animation
            const nftCard = document.querySelector(`[data-mint="${nft.mint}"]`) as HTMLElement;
            if (nftCard && window.BurnAnimations.applyBurnAnimation) {
              window.BurnAnimations.applyBurnAnimation(nftCard);
            }
            
            // Show confetti animation
            if (window.BurnAnimations.createConfetti) {
              window.BurnAnimations.createConfetti();
            }
            
            // Track achievement
            if (window.BurnAnimations.checkAchievements) {
              window.BurnAnimations.checkAchievements('nfts', 1);
            }
          }
          
          // Show message about rent recovery and donation
          setError(`Successfully burned NFT "${nft.name || 'NFT'}" and recovered rent to your wallet! A small donation has been sent to support the project.`);
          setTimeout(() => setError(null), 5000); // Clear message after 5 seconds
        }
      } catch (signingError: any) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Check if the error is related to user cancellation
        if (signingError.message.includes('timed out') || 
            signingError.message.includes('cancelled') ||
            signingError.message.includes('rejected') ||
            signingError.message.includes('User rejected')) {
          console.log('Transaction was cancelled by the user or timed out');
          setError('Transaction was cancelled. Please try again if you want to burn this NFT.');
          return;
        }
        
        // For other signing errors, rethrow
        throw signingError;
      }
    } catch (error: any) {
      console.error('Error burning NFT:', error);
      
      // Special handling for SOL-related errors
      const errorMessage = error.message || '';
      const isInsufficientSOLError = (
        errorMessage.includes('insufficient') || 
        errorMessage.includes('balance') ||
        errorMessage.includes('0x1') ||
        errorMessage.includes('fund')
      );
      
      const isWalletConnectionError = (
        errorMessage.includes('wallet') || 
        errorMessage.includes('connection') ||
        errorMessage.includes('adapter')
      );
      
      if (isInsufficientSOLError) {
        setError('Transaction failed due to network fee issues. We\'ve updated the app to fix this. Please try again.');
      } else if (isWalletConnectionError) {
        setError('Wallet connection error. Please check your wallet and try again.');
      } else {
        setError(`Error burning NFT: ${error.message}`);
      }
    }
  };

  // Function to handle opening the Direct Trash Modal
  const openDirectTrashModal = (cnft: CNFTData) => {
    setSelectedCnftForTrash({
      id: cnft.mint,
      name: cnft.name || `Asset ${cnft.mint.slice(0, 8)}...`,
      image: cnft.image
    });
    setDirectTrashModalOpen(true);
  };
  
  // Function to handle opening the Delegated Transfer Modal
  const openDelegatedTransferModal = (cnft: CNFTData) => {
    console.log("[WalletAssets] Selected cNFT for delegated transfer:", cnft.mint);
    setSelectedCnftForDelegatedTransfer({
      id: cnft.mint,
      name: cnft.name || `Asset ${cnft.mint.slice(0, 8)}...`,
      image: cnft.image
    });
    setDelegatedTransferModalOpen(true);
  };
  
  // Function to handle opening the Queue Transfer Modal for bulk operations
  const openQueueTransferModal = () => {
    if (selectedCNFTs.length === 0) {
      console.log('[WalletAssets] No cNFTs selected for queue transfer');
      if (typeof window !== 'undefined' && window.BurnAnimations) {
        window.BurnAnimations.showNotification(
          'No cNFTs Selected',
          'Please select at least one cNFT to trash using the bulk queue system.'
        );
      }
      return;
    }
    
    // Prepare selected assets data
    const selectedAssets = cnfts
      .filter(cnft => selectedCNFTs.includes(cnft.mint))
      .map(cnft => ({
        mint: cnft.mint,
        name: cnft.name || `Asset ${cnft.mint.slice(0, 8)}...`,
        image: cnft.image
      }));
    
    console.log('[WalletAssets] Opening queue transfer modal for assets:', selectedAssets);
    setSelectedCnftsForQueueTransfer(selectedAssets);
    setQueueTransferModalOpen(true);
  };
  
  // Handle successful direct trash operation
  const handleDirectTrashSuccess = (result: any) => {
    // Check which modal was active
    if (selectedCnftForTrash && directTrashModalOpen) {
      console.log('[WalletAssets] Direct trash operation successful for asset:', selectedCnftForTrash.id);
      
      // Track successful result in debug info
      if (window.debugInfo) {
        window.debugInfo.lastCnftSuccess = true;
        window.debugInfo.lastCnftSignature = result.signature || '';
        window.debugInfo.transferMethod = 'Direct CLI-based transfer';
      }
    } 
    // Handle delegated transfer success
    else if (selectedCnftForDelegatedTransfer && delegatedTransferModalOpen) {
      console.log('[WalletAssets] Delegated transfer successful for asset:', selectedCnftForDelegatedTransfer.id);
      console.log('[WalletAssets] Result:', result);
      
      // Track successful result in debug info
      if (window.debugInfo) {
        window.debugInfo.lastCnftSuccess = true;
        window.debugInfo.lastCnftSignature = result.signature || '';
        window.debugInfo.transferMethod = 'Delegated Helius transfer';
      }
    }
    
    // Log signature if available
    if (result && result.signature) {
      console.log('[WalletAssets] Signature:', result.signature);
    }
    
    // Show success notification
    if (window.BurnAnimations) {
      window.BurnAnimations.createConfetti();
      window.BurnAnimations.showNotification(
        'cNFT Trashed! 🎉',
        `Successfully trashed ${selectedCnftForTrash.name}`
      );
      window.BurnAnimations.checkAchievements('trash', 1);
      window.BurnAnimations.checkAchievements('cnfts', 1);
    }
    
    // Update UI to reflect the removal
    setCnfts(prevCnfts => prevCnfts.filter(item => item.mint !== selectedCnftForTrash.id));
    
    // Close the modal
    setDirectTrashModalOpen(false);
    setSelectedCnftForTrash(null);
    
    // Show a success message
    setError(`Successfully trashed compressed NFT "${selectedCnftForTrash.name}" via direct method! Transaction: ${signature.substring(0, 8)}...`);
    setTimeout(() => setError(null), 8000);
  };
  
  // Handle error in direct trash operation
  const handleDirectTrashError = (error: string) => {
    console.error('[WalletAssets] Direct trash operation error:', error);
    
    // Track error in debug info
    if (window.debugInfo) {
      window.debugInfo.lastCnftError = error;
      window.debugInfo.lastCnftSuccess = false;
    }
    
    // Keep the modal open to show the error
    // The error will be displayed in the modal itself
  };
  
  // Function to handle burning compressed NFTs (cNFTs)
  const handleBurnCNFT = async (cnft: CNFTData) => {
    if (!publicKey || !connection) {
      setError('Wallet connection required');
      return;
    }
    
    // Show achievement for attempting
    if (window.BurnAnimations?.checkAchievements) {
      window.BurnAnimations.checkAchievements('cnft_attempts', 1);
    }
    
    // Show notification explaining that we're opening the direct transfer option
    if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
      window.BurnAnimations.showNotification(
        "Direct cNFT Trash Option", 
        "Opening direct trash dialog which requires your private key..."
      );
    }
    
    // Track this attempt for analytics
    if (typeof window !== 'undefined' && window.debugInfo) {
      window.debugInfo.cnftTransferAttempted = true;
      window.debugInfo.lastCnftData = cnft;
    }
    
    try {
      console.log("[WalletAssets] Processing cNFT:", cnft.mint);
      
      // IMPORTANT: Directly fetch proof data first because this is a common failure point
      try {
        setError(`Fetching proof data for ${cnft.name || 'cNFT'}...`);
        // Fetch proof data directly from API
        const proofResponse = await fetch(`/api/helius/asset-proof/${cnft.mint}`);
        const proofResult = await proofResponse.json();
        
        if (proofResult.success && proofResult.data) {
          console.log("Successfully pre-fetched proof data for cNFT:", cnft.mint);
          console.log("Proof data:", proofResult.data);
          
          // Cache the proof data in window for later use
          if (typeof window !== 'undefined') {
            window.cachedProofData = window.cachedProofData || {};
            window.cachedProofData[cnft.mint] = proofResult.data;
          }
        } else {
          console.warn("Pre-fetch of proof data returned unsuccessful result:", proofResult);
        }
      } catch (proofError) {
        console.error("Error pre-fetching proof data:", proofError);
        // Continue anyway - don't throw here, we'll handle this in the actual transfer flow
      }
      
      // Check if the asset has delegation set
      console.log("[WalletAssets] Checking delegation support for cNFT:", cnft.mint);
      
      axios.get(`/api/delegate/info/${cnft.mint}`)
        .then(response => {
          const isDelegationAvailable = response.data?.success && 
                                       response.data?.delegationInfo?.delegated === true;
          
          if (isDelegationAvailable) {
            console.log("[WalletAssets] Delegation available, opening DelegatedTransferModal");
            openDelegatedTransferModal(cnft);
          } else {
            console.log("[WalletAssets] No delegation, using DirectTrashModal");
            openDirectTrashModal(cnft);
          }
        })
        .catch(error => {
          // If there's an error checking delegation, fallback to direct trash
          console.error("Error checking delegation:", error);
          openDirectTrashModal(cnft);
        });
        
    } catch (error) {
      console.error("Error initiating trash operation:", error);
      
      // Show error to user
      setError(`Error initiating trash operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fallback to direct trash modal
      openDirectTrashModal(cnft);
      
      // Show notification with more details
      if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Direct Trash Error", 
          "There was a problem opening the direct trash dialog. Please try again."
        );
      }
      
      // Log for debugging
      if (typeof window !== 'undefined' && window.debugInfo) {
        window.debugInfo.lastCnftError = error;
      }
      
      setTimeout(() => setError(null), 8000);
    }
  };
  
  // Helper function to handle successful cNFT transfers to project wallet
  const handleBurnSuccess = (cnft: CNFTData) => {
    // Update the cNFTs list by removing the transferred cNFT
    const updatedCnfts = cnfts.filter(c => c.mint !== cnft.mint);
    setCnfts(updatedCnfts);
    
    // Apply animations
    if (window.BurnAnimations) {
      // Find the cNFT card element for transfer animation
      const cnftCard = document.querySelector(`[data-mint="${cnft.mint}"]`) as HTMLElement;
      if (cnftCard && window.BurnAnimations.applyBurnAnimation) {
        window.BurnAnimations.applyBurnAnimation(cnftCard);
      }
      
      // Show confetti animation
      if (window.BurnAnimations.createConfetti) {
        window.BurnAnimations.createConfetti();
      }
      
      // Track achievement
      if (window.BurnAnimations.checkAchievements) {
        window.BurnAnimations.checkAchievements('cnfts', 1);
      }
    }
    
    // Show success message
    setError(`Successfully transferred compressed NFT "${cnft.name || 'cNFT'}" to project wallet! Compressed NFTs don't return rent as they are already efficiently stored on-chain.`);
    
    setTimeout(() => setError(null), 5000);
  };
  
  // Helper function for handling single cNFT success in batch context
  const handleSingleCnftSuccess = (result: any, mint: string) => {
    // Find the cNFT in the list
    const cnft = cnfts.find(c => c.mint === mint);
    
    // Remove from list of cNFTs
    setCnfts(prev => prev.filter(c => c.mint !== mint));
    
    // Remove from selected cNFTs
    setSelectedCNFTs(prev => prev.filter(m => m !== mint));
    
    // Apply animation
    const cnftCard = document.querySelector(`[data-mint="${mint}"]`) as HTMLElement;
    if (cnftCard && window.BurnAnimations?.applyBurnAnimation) {
      window.BurnAnimations.applyBurnAnimation(cnftCard);
    }
    
    // Show confetti
    if (window.BurnAnimations?.createConfetti) {
      window.BurnAnimations.createConfetti();
    }
    
    // Track achievement
    if (window.BurnAnimations?.checkAchievements) {
      window.BurnAnimations.checkAchievements('cnfts', 1);
    }
    
    // Show success message
    const shortSig = result.signature ? result.signature.substring(0, 8) + "..." : "";
    setError(`Successfully trashed cNFT! ${shortSig ? `Signature: ${shortSig}` : ""}`);
    
    // Add transaction link if available
    if (result.signature) {
      const txUrl = `https://solscan.io/tx/${result.signature}`;
      setTimeout(() => {
        const txElem = document.createElement('div');
        txElem.innerHTML = `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color: #4da6ff; text-decoration: underline;">View transaction</a>`;
        
        if (document.querySelector('.error-message')) {
          document.querySelector('.error-message')?.appendChild(txElem);
        }
      }, 100);
    }
    
    setTimeout(() => setError(null), 8000);
    
    // Set burning state to false
    setIsBurning(false);
    
    // Return a properly formatted result that matches the batch result structure
    return {
      success: true,
      signature: result.signature,
      method: result.method || "single-transfer",
      processedAssets: [mint],
      failedAssets: []
    };
  };

  // Function to refresh all wallet assets
  const refreshAllAssets = () => {
    if (publicKey) {
      console.log('[WalletAssets] Refreshing all wallet assets');
      // Refetch all asset types
      fetchTokens();
      fetchAllNFTs();
      fetchCNFTsWithHandler();
    }
  };

  // Handle successful queue transfer
  const handleQueueTransferSuccess = () => {
    console.log('[WalletAssets] Queue transfer completed');
    
    // Update UI - remove processed cNFTs
    // We'll do a full refresh to ensure we have the latest data
    refreshAllAssets();
    
    // Clear selected CNFTs
    setSelectedCNFTs([]);
    
    // Close the modal
    setQueueTransferModalOpen(false);
    
    // Clear the selected assets
    setTimeout(() => {
      setSelectedCnftsForQueueTransfer([]);
    }, 500);
    
    // Set burning state to false
    setIsBurning(false);
  };
  
  // Toggle bulk burn mode
  const toggleBulkBurnMode = () => {
    setBulkBurnMode(!bulkBurnMode);
    // Clear selections when toggling
    if (bulkBurnMode) {
      setSelectedTokens([]);
      setSelectedNFTs([]);
      setSelectedCNFTs([]);
    }
  };

  // Handle selection of tokens
  const handleTokenSelection = (mint: string) => {
    setSelectedTokens(prev => 
      prev.includes(mint) 
        ? prev.filter(m => m !== mint) 
        : [...prev, mint]
    );
  };

  // Handle selection of NFTs
  const handleNFTSelection = (mint: string) => {
    setSelectedNFTs(prev => 
      prev.includes(mint) 
        ? prev.filter(m => m !== mint) 
        : [...prev, mint]
    );
  };

  // Handle selection of cNFTs
  const handleCNFTSelection = (mint: string) => {
    setSelectedCNFTs(prev => 
      prev.includes(mint) 
        ? prev.filter(m => m !== mint) 
        : [...prev, mint]
    );
  };

  // Handle bulk burn of tokens - with batching in a single transaction
  const handleBulkBurnTokens = async () => {
    if (selectedTokens.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk burn operation for tokens in a single transaction...");
    
    try {
      // Import necessary web3 modules
      const { ComputeBudgetProgram } = require('@solana/web3.js');
      
      // Create a single transaction for all token burns
      const transaction = new Transaction();
      
      // Add compute budget instructions to avoid insufficient SOL errors
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 200000 * Math.min(5, selectedTokens.size || 1) // Scale compute units based on number of tokens with a cap
      });
      
      // Add a compute budget instruction to set a very low prioritization fee 
      // Using same fee as single burns to keep costs consistent
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1 // Minimum possible fee (consistent with single burn)
      });
      
      // Add compute budget instructions to transaction
      transaction.add(modifyComputeUnits, addPriorityFee);
      
      // Define fee recipient for donation
      const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
      
      // Keep track of which tokens were successfully added to the transaction
      const processedTokens = [];
      const failedTokens = [];
      
      // Maximum number of tokens to process in a single transaction (to avoid size limits)
      const MAX_TOKENS_PER_BATCH = 8;
      const tokensToProcess = selectedTokens.slice(0, MAX_TOKENS_PER_BATCH);
      
      if (tokensToProcess.length < selectedTokens.length) {
        setError(`Processing first ${MAX_TOKENS_PER_BATCH} tokens in this batch. Remaining tokens will need a separate transaction.`);
      }
      
      // Add burn and close instructions for each token
      for (const mint of tokensToProcess) {
        const token = tokens.find(t => t.mint === mint);
        if (token && token.account) {
          try {
            // Add burn instruction for this token
            transaction.add(
              createBurnCheckedInstruction(
                new PublicKey(token.account), // token account
                new PublicKey(token.mint), // mint
                publicKey, // owner
                token.balance, // amount to burn
                token.decimals // decimals
              )
            );
            
            // Add close account instruction to recover rent
            transaction.add(
              createCloseAccountInstruction(
                new PublicKey(token.account), // token account to close
                publicKey, // destination for recovered SOL
                publicKey, // authority
                [] // multisig signers (empty in our case)
              )
            );
            
            processedTokens.push(token);
          } catch (error) {
            console.error(`Error adding token ${mint} to transaction:`, error);
            failedTokens.push(token);
          }
        } else {
          failedTokens.push({mint});
        }
      }
      
      // If no tokens were successfully added, exit
      if (processedTokens.length === 0) {
        setError("Could not add any tokens to the transaction. Please try again or burn individually.");
        setIsBurning(false);
        return;
      }
      
      // Add a single donation instruction (instead of one per token)
      // Scale the fee based on number of tokens, but with a reasonable cap
      const feePerToken = 40000; // 0.00004 SOL in lamports
      const maxFee = 100000; // Cap at 0.0001 SOL
      const feeAmount = Math.min(feePerToken * processedTokens.length, maxFee);
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: feeRecipient,
          lamports: feeAmount,
        })
      );
      
      // Get recent blockhash with lower fee priority
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
        commitment: 'processed' // Lower commitment level to reduce fees
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Create a timeoutPromise that rejects after 2 minutes
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<Transaction>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Transaction signing timed out or was cancelled'));
        }, 120000); // 2 minute timeout
      });
      
      // Update UI to show we're waiting for signature
      setError(`Please approve the transaction in your wallet to burn ${processedTokens.length} tokens at once...`);
      
      try {
        // Race between the signTransaction and the timeout
        const signedTx = await Promise.race([
          signTransaction(transaction),
          timeoutPromise
        ]);
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Update UI to show transaction is being processed
        setError(`Sending transaction to burn ${processedTokens.length} tokens at once...`);
        
        // Send the transaction with skipPreflight to avoid client-side checks
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true, // Skip preflight checks
          maxRetries: 3, // Retry a few times if needed
          preflightCommitment: 'processed' // Lower commitment level
        });
        
        console.log('Bulk token burn transaction sent with signature:', signature);
        
        // Wait for confirmation with a custom strategy to avoid timeouts
        const confirmation = await connection.confirmTransaction({
          signature: signature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'processed'); // Use processed commitment level
        
        console.log('Bulk burn confirmation result:', confirmation);
        
        if (confirmation.value.err) {
          console.error('Error confirming bulk burn transaction:', confirmation.value.err);
          setError(`Error burning tokens: ${confirmation.value.err}`);
        } else {
          console.log('Bulk token burn successful with signature:', signature);
          
          // Update the tokens list by removing all burned tokens
          const updatedTokens = tokens.filter(t => !processedTokens.some(p => p.mint === t.mint));
          setTokens(updatedTokens);
          
          // Remove processed tokens from selected tokens
          const remainingSelected = selectedTokens.filter(
            mint => !processedTokens.some(p => p.mint === mint)
          );
          setSelectedTokens(remainingSelected);
          
          // Show animations and achievements
          if (window.BurnAnimations) {
            // Show confetti animation
            if (window.BurnAnimations.createConfetti) {
              window.BurnAnimations.createConfetti();
            }
            
            // Track achievements - count multiple burns
            if (window.BurnAnimations.checkAchievements) {
              window.BurnAnimations.checkAchievements('tokens', processedTokens.length);
            }
          }
          
          // Show success message with transaction link
          const txUrl = `https://solscan.io/tx/${signature}`;
          const shortSig = signature.substring(0, 8) + '...';
          
          setError(`Successfully burned ${processedTokens.length} tokens in a single transaction! Signature: ${shortSig}`);
          
          // Add link to transaction
          setTimeout(() => {
            const txElem = document.createElement('div');
            txElem.innerHTML = `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color: #4da6ff; text-decoration: underline;">View transaction</a>`;
            
            if (document.querySelector('.error-message')) {
              document.querySelector('.error-message')?.appendChild(txElem);
            }
          }, 100);
          
          // If there are remaining tokens, show a message
          if (remainingSelected.length > 0) {
            setTimeout(() => {
              setError(`${remainingSelected.length} tokens remain selected. Click "Burn Selected" again to process them.`);
            }, 5000);
          } else {
            setTimeout(() => setError(null), 8000);
          }
        }
      } catch (signingError: any) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Check if the error is related to user cancellation
        if (signingError.message.includes('timed out') || 
            signingError.message.includes('cancelled') ||
            signingError.message.includes('rejected') ||
            signingError.message.includes('User rejected')) {
          console.log('Transaction was cancelled by the user or timed out');
          setError('Transaction was cancelled. No tokens were burned.');
        } else {
          // For other signing errors
          setError(`Error in transaction signing: ${signingError.message}`);
        }
      }
    } catch (error: any) {
      console.error('Error in bulk burn operation:', error);
      setError(`Error in bulk burn operation: ${error.message}`);
    } finally {
      setIsBurning(false);
    }
  };

  // Handle bulk burn of NFTs - with batching in a single transaction
  const handleBulkBurnNFTs = async () => {
    if (selectedNFTs.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk burn operation for NFTs in a single transaction...");
    
    try {
      // Import necessary web3 modules
      const { ComputeBudgetProgram } = require('@solana/web3.js');
      
      // Create a single transaction for all NFT burns
      const transaction = new Transaction();
      
      // Add compute budget instructions to avoid insufficient SOL errors
      const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
        units: 200000 * Math.min(5, selectedNFTs.length || 1) // Scale compute units proportionally with a cap
      });
      
      // Add a compute budget instruction to set a very low prioritization fee 
      // Using same fee as single burns to keep costs consistent
      const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1 // Minimum possible fee (consistent with single burn)
      });
      
      // Add compute budget instructions to transaction
      transaction.add(modifyComputeUnits, addPriorityFee);
      
      // Define fee recipient for donation
      const feeRecipient = new PublicKey('EYjsLzE9VDy3WBd2beeCHA1eVYJxPKVf6NoKKDwq7ujK');
      
      // Keep track of which NFTs were successfully added to the transaction
      const processedNFTs = [];
      const failedNFTs = [];
      
      // Maximum number of NFTs to process in a single transaction (to avoid size limits)
      const MAX_NFTS_PER_BATCH = 5; // NFTs require more instructions than tokens
      const nftsToProcess = selectedNFTs.slice(0, MAX_NFTS_PER_BATCH);
      
      if (nftsToProcess.length < selectedNFTs.length) {
        setError(`Processing first ${MAX_NFTS_PER_BATCH} NFTs in this batch. Remaining NFTs will need a separate transaction.`);
      }
      
      // Add burn and close instructions for each NFT
      for (const mint of nftsToProcess) {
        const nft = nfts.find(n => n.mint === mint);
        if (nft && nft.tokenAddress) {
          try {
            // Add close token account instruction (effectively burns the NFT)
            transaction.add(
              createCloseAccountInstruction(
                new PublicKey(nft.tokenAddress),  // token account to close
                publicKey,                        // destination for recovered SOL
                publicKey,                        // authority
                []                                // multisig signers (empty in our case)
              )
            );
            
            processedNFTs.push(nft);
          } catch (error) {
            console.error(`Error adding NFT ${mint} to transaction:`, error);
            failedNFTs.push(nft);
          }
        } else {
          failedNFTs.push({mint});
        }
      }
      
      // If no NFTs were successfully added, exit
      if (processedNFTs.length === 0) {
        setError("Could not add any NFTs to the transaction. Please try again or burn individually.");
        setIsBurning(false);
        return;
      }
      
      // Add a single donation instruction (instead of one per NFT)
      // Scale the fee based on number of NFTs, but with a reasonable cap
      const feePerNFT = 40000; // 0.00004 SOL in lamports
      const maxFee = 100000; // Cap at 0.0001 SOL
      const feeAmount = Math.min(feePerNFT * processedNFTs.length, maxFee);
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: feeRecipient,
          lamports: feeAmount,
        })
      );
      
      // Get recent blockhash with lower fee priority
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash({
        commitment: 'processed' // Lower commitment level to reduce fees
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Create a timeoutPromise that rejects after 2 minutes
      let timeoutId: NodeJS.Timeout;
      const timeoutPromise = new Promise<Transaction>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Transaction signing timed out or was cancelled'));
        }, 120000); // 2 minute timeout
      });
      
      // Update UI to show we're waiting for signature
      setError(`Please approve the transaction in your wallet to burn ${processedNFTs.length} NFTs at once...`);
      
      try {
        // Race between the signTransaction and the timeout
        const signedTx = await Promise.race([
          signTransaction(transaction),
          timeoutPromise
        ]);
        
        // Clear the timeout since we got a response
        clearTimeout(timeoutId);
        
        // Update UI to show transaction is being processed
        setError(`Sending transaction to burn ${processedNFTs.length} NFTs at once...`);
        
        // Send the transaction with skipPreflight to avoid client-side checks
        const signature = await connection.sendRawTransaction(signedTx.serialize(), {
          skipPreflight: true, // Skip preflight checks
          maxRetries: 3, // Retry a few times if needed
          preflightCommitment: 'processed' // Lower commitment level
        });
        
        console.log('Bulk NFT burn transaction sent with signature:', signature);
        
        // Wait for confirmation with a custom strategy to avoid timeouts
        const confirmation = await connection.confirmTransaction({
          signature: signature,
          blockhash: blockhash,
          lastValidBlockHeight: lastValidBlockHeight
        }, 'processed'); // Use processed commitment level
        
        console.log('Bulk burn confirmation result:', confirmation);
        
        if (confirmation.value.err) {
          console.error('Error confirming bulk burn transaction:', confirmation.value.err);
          setError(`Error burning NFTs: ${confirmation.value.err}`);
        } else {
          console.log('Bulk NFT burn successful with signature:', signature);
          
          // Update the NFTs list by removing all burned NFTs
          const updatedNFTs = nfts.filter(n => !processedNFTs.some(p => p.mint === n.mint));
          setNfts(updatedNFTs);
          
          // Remove processed NFTs from selected NFTs
          const remainingSelected = selectedNFTs.filter(
            mint => !processedNFTs.some(p => p.mint === mint)
          );
          setSelectedNFTs(remainingSelected);
          
          // Show animations and achievements
          if (window.BurnAnimations) {
            // Show confetti animation
            if (window.BurnAnimations.createConfetti) {
              window.BurnAnimations.createConfetti();
            }
            
            // Track achievements - count multiple burns
            if (window.BurnAnimations.checkAchievements) {
              window.BurnAnimations.checkAchievements('nfts', processedNFTs.length);
            }
          }
          
          // Show success message with transaction link
          const txUrl = `https://solscan.io/tx/${signature}`;
          const shortSig = signature.substring(0, 8) + '...';
          
          setError(`Successfully burned ${processedNFTs.length} NFTs in a single transaction! Signature: ${shortSig}`);
          
          // Add link to transaction
          setTimeout(() => {
            const txElem = document.createElement('div');
            txElem.innerHTML = `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color: #4da6ff; text-decoration: underline;">View transaction</a>`;
            
            if (document.querySelector('.error-message')) {
              document.querySelector('.error-message')?.appendChild(txElem);
            }
          }, 100);
          
          // If there are remaining NFTs, show a message
          if (remainingSelected.length > 0) {
            setTimeout(() => {
              setError(`${remainingSelected.length} NFTs remain selected. Click "Burn Selected" again to process them.`);
            }, 5000);
          } else {
            setTimeout(() => setError(null), 8000);
          }
        }
      } catch (signingError: any) {
        // Clear timeout
        clearTimeout(timeoutId);
        
        // Check if the error is related to user cancellation
        if (signingError.message.includes('timed out') || 
            signingError.message.includes('cancelled') ||
            signingError.message.includes('rejected') ||
            signingError.message.includes('User rejected')) {
          console.log('Transaction was cancelled by the user or timed out');
          setError('Transaction was cancelled. No NFTs were burned.');
        } else {
          // For other signing errors
          setError(`Error in transaction signing: ${signingError.message}`);
        }
      }
    } catch (error: any) {
      console.error('Error in bulk burn operation:', error);
      setError(`Error in bulk burn operation: ${error.message}`);
    } finally {
      setIsBurning(false);
    }
  };

  // Handle bulk transfer of cNFTs to project wallet
  const handleBulkBurnCNFTs = async () => {
    if (selectedCNFTs.length === 0) return;
    
    setIsBurning(true);
    setError("Processing compressed NFT transfers to project wallet...");
    
    try {
      // Create a CNFTHandler instance with the current connection and wallet
      console.log("Creating CNFTHandler instance for bulk transfers");
      
      // Use the directly imported CNFTHandler class
      const handler = new CNFTHandler(connection, {
        publicKey,
        signTransaction
      });
      
      // SPECIAL CASE: If only one cNFT is selected, use the regular single transfer method
      // This avoids the batch transfer issue when only one cNFT is involved
      if (selectedCNFTs.length === 1) {
        console.log("Only one cNFT selected, using single transfer instead of batch");
        
        // Show notification about single transfer
        if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
          window.BurnAnimations.showNotification(
            "Processing Single cNFT Trash", 
            "Preparing to trash a single cNFT"
          );
        }
        
        try {
          // Get the single mint to process
          const singleMint = selectedCNFTs[0];
          
          // Find the cNFT data for this mint
          const cnftData = cnfts.find(c => c.mint === singleMint);
          if (!cnftData) {
            throw new Error(`Could not find cNFT data for ${singleMint}`);
          }
          
          console.log("Found cNFT data:", cnftData);
          
          // Explicitly fetch asset proof data - this is crucial for transfer
          let proofData = null;
          try {
            setError(`Fetching proof data for ${cnftData.name || 'cNFT'}...`);
            // Fetch proof data directly from API
            const proofResponse = await fetch(`/api/helius/asset-proof/${singleMint}`);
            const proofResult = await proofResponse.json();
            
            if (proofResult.success && proofResult.data) {
              proofData = proofResult.data;
              console.log("Successfully fetched proof data for cNFT");
            } else {
              throw new Error("Failed to fetch proof data");
            }
          } catch (proofError) {
            console.error("Error fetching proof data:", proofError);
            throw new Error("Failed to get required proof data for the cNFT. Cannot complete transfer");
          }
          
          setError(`Processing trash operation for ${cnftData.name || 'cNFT'}...`);
          
          // Now use the handler with explicit proof data
          const singleResult = await handler.transferCNFTWithProof(singleMint, proofData);
          
          if (singleResult.success) {
            // Format the result to match batch response structure for consistent handling
            return handleSingleCnftSuccess(singleResult, singleMint);
          } else {
            throw new Error(singleResult.error || "Single cNFT transfer failed");
          }
        } catch (error) {
          console.error("Error in single cNFT transfer special case:", error);
          setError(`Error: ${error.message || "Failed to process cNFT"}`);
          setIsBurning(false);
          throw error;
        }
      }
      
      // Show notification about the batch transfer process for multiple cNFTs
      if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
        window.BurnAnimations.showNotification(
          "Preparing Batch Trash Operation", 
          `Preparing to trash ${selectedCNFTs.length} cNFTs in a single transaction`
        );
      }
      
      // Track this batch attempt for analytics
      if (typeof window !== 'undefined' && window.debugInfo) {
        window.debugInfo.cnftTransferAttempted = true;
        window.debugInfo.bulkBurnAttempted = true;
        window.debugInfo.batchTransferAttempted = true;
      }
      
      // Use our new batch transfer method
      setError(`Preparing batch transaction for ${selectedCNFTs.length} cNFTs...`);
      
      // Create an array of mint addresses to process
      const mintsToProcess = selectedCNFTs.slice();
      
      // Submit batch transfer request (only for multiple cNFTs)
      const result = await handler.batchTransferCNFTs(mintsToProcess);
      console.log("Batch transfer result:", result);
      
      if (result.success) {
        // Success! Transaction succeeded and processed at least some assets
        const processedCount = result.processedAssets?.length || 0;
        const failedCount = result.failedAssets?.length || 0;
        
        // Apply animations to processed assets
        if (processedCount > 0) {
          // Update the UI by removing the processed cNFTs
          if (result.processedAssets && Array.isArray(result.processedAssets)) {
            // Remove successfully processed assets from the UI
            setCnfts(prev => prev.filter(c => !result.processedAssets.includes(c.mint)));
            
            // Apply animations to each processed cNFT
            result.processedAssets.forEach(mint => {
              const cnftCard = document.querySelector(`[data-mint="${mint}"]`) as HTMLElement;
              if (cnftCard && window.BurnAnimations?.applyBurnAnimation) {
                window.BurnAnimations.applyBurnAnimation(cnftCard);
              }
            });
            
            // Remove processed assets from the selected assets list
            setSelectedCNFTs(prev => prev.filter(mint => !result.processedAssets.includes(mint)));
          }
          
          // Show confetti for successful batch
          if (window.BurnAnimations?.createConfetti) {
            window.BurnAnimations.createConfetti();
          }
          
          // Track multiple achievements at once
          if (window.BurnAnimations?.checkAchievements) {
            window.BurnAnimations.checkAchievements('cnfts', processedCount);
          }
          
          // Show success message with transaction link
          if (result.signature && result.explorerUrl) {
            const shortSig = result.signature.substring(0, 8) + "...";
            const txUrl = result.explorerUrl;
            
            setError(`Successfully trashed ${processedCount} cNFTs in a single transaction! Signature: ${shortSig}`);
            
            // Add link to transaction
            setTimeout(() => {
              const txElem = document.createElement('div');
              txElem.innerHTML = `<a href="${txUrl}" target="_blank" rel="noopener noreferrer" style="color: #4da6ff; text-decoration: underline;">View transaction</a>`;
              
              if (document.querySelector('.error-message')) {
                document.querySelector('.error-message')?.appendChild(txElem);
              }
            }, 100);
            
            // Show message about any failed assets if applicable
            if (failedCount > 0) {
              setTimeout(() => {
                setError(`${failedCount} cNFTs could not be included in the batch. Try again with those assets separately.`);
              }, 7000);
            }
          } else {
            setError(`Successfully trashed ${processedCount} cNFTs in a single transaction!`);
          }
        } else {
          // No assets were processed in the batch
          setError("No cNFTs were included in the batch transaction. Check console for details.");
        }
      } else {
        // Transaction failed
        console.error("Batch transfer failed:", result.error);
        
        // Check if it was cancelled by the user
        if (result.cancelled) {
          setError("Transaction was cancelled by the user. No cNFTs were trashed.");
        } else if (result.method === "individual-fallback") {
          // Fallback process handled some assets
          const successCount = result.successCount || 0;
          const totalCount = result.totalCount || 0;
          
          if (successCount > 0) {
            setError(`Batch transaction failed but completed ${successCount} of ${totalCount} individual transfers as fallback.`);
            
            // Show confetti for partial success
            if (window.BurnAnimations?.createConfetti) {
              window.BurnAnimations.createConfetti();
            }
            
            // Track achievements for individual successes
            if (window.BurnAnimations?.checkAchievements) {
              window.BurnAnimations.checkAchievements('cnfts', successCount);
            }
            
            // Remove processed assets from the UI
            if (result.results && Array.isArray(result.results)) {
              result.results.forEach(itemResult => {
                if (itemResult.success && itemResult.assetId) {
                  // Remove from UI
                  setCnfts(prev => prev.filter(c => c.mint !== itemResult.assetId));
                  
                  // Apply animation
                  const cnftCard = document.querySelector(`[data-mint="${itemResult.assetId}"]`) as HTMLElement;
                  if (cnftCard && window.BurnAnimations?.applyBurnAnimation) {
                    window.BurnAnimations.applyBurnAnimation(cnftCard);
                  }
                  
                  // Remove from selected list
                  setSelectedCNFTs(prev => prev.filter(mint => mint !== itemResult.assetId));
                }
              });
            }
          } else {
            setError(`Batch transaction failed and no individual transfers succeeded. Please try again.`);
          }
        } else {
          // Regular error with enhanced user feedback
          // Try to extract more specific error information for a better user experience
          let errorMessage = "Error trashing cNFTs";
          let errorDetails = "Please try again or check your wallet connection.";
          
          if (result.error) {
            const errorMsg = result.error.toString().toLowerCase();
            
            // Proof data issues
            if (errorMsg.includes("proof") || errorMsg.includes("hash") || errorMsg.includes("buffer")) {
              errorMessage = "Could not process the cNFT transaction";
              errorDetails = "The proof data couldn't be properly validated. This can happen when blockchain data is inconsistent or not fully synced. Please try again in a few minutes.";
            } 
            // Invalid format issues
            else if (errorMsg.includes("format") || errorMsg.includes("invalid") || errorMsg.includes("expected")) {
              errorMessage = "Validation error in transaction data";
              errorDetails = "There was a formatting issue with the transaction data. Please try selecting just one cNFT to trash instead of a batch.";
            }
            // RPC issues 
            else if (errorMsg.includes("rpc") || errorMsg.includes("connection") || errorMsg.includes("network")) {
              errorMessage = "Network connection issue";
              errorDetails = "Could not connect to the Solana network properly. Please check your internet connection and try again.";
            }
            // Rejected by user
            else if (errorMsg.includes("rejected") || errorMsg.includes("cancelled") || errorMsg.includes("declined")) {
              errorDetails = "The transaction was rejected in your wallet.";
            } else if (errorMsg.includes("funds")) {
              errorDetails = "Not enough SOL in your wallet to pay for the transaction.";
            } else {
              errorDetails = errorMsg.substring(0, 100);
            }
          }
          
          // Set the error message with the enhanced details
          setError(`${errorMessage}: ${errorDetails}`);
          
          // Show additional explanation in a notification
          if (typeof window !== 'undefined' && window.BurnAnimations?.showNotification) {
            window.BurnAnimations.showNotification(
              "cNFT Batch Trash Failed", 
              errorDetails
            );
          }
        }
      }
      
      // Clear the error message after a delay
      setTimeout(() => setError(null), 8000);
    } catch (error: any) {
      console.error('Error processing cNFTs:', error);
      setError(`Error processing cNFTs: ${error.message}`);
    } finally {
      setIsBurning(false);
    }
  };

  return (
    <div className="wallet-assets-container">
      <div className="wallet-connect-section">
        <h2>Connect Wallet to View Assets</h2>
        <WalletMultiButton />
      </div>

      {publicKey && (
        <div className="assets-section">
          <div className="wallet-header">
            <h2>Your Wallet Assets</h2>
            <button 
              className="refresh-button" 
              onClick={() => {
                console.log("Manual refresh triggered");
                // Create a timestamp to force cache-busting
                const timestamp = Date.now();
                if (publicKey) {
                  // Add loading indicator
                  setIsRefreshing(true);
                  // Call the wallet-related APIs with the timestamp to bust cache
                  axios.get(`/api/helius/wallet/nfts/${publicKey.toBase58()}?t=${timestamp}`)
                    .then(response => {
                      if (response.data && response.data.success) {
                        const { regularNfts, compressedNfts } = response.data.data;
                        setNfts(regularNfts);
                        
                        // Filter out hidden compressed NFTs if the HiddenAssets functionality is available
                        let visibleCompressedNfts = compressedNfts;
                        if (typeof window !== "undefined" && window.HiddenAssets) {
                          visibleCompressedNfts = compressedNfts.filter((cnft) => 
                            !window.HiddenAssets?.isAssetHidden(cnft.mint));
                        }
                        
                        setCnfts(visibleCompressedNfts);
                        console.log(`Refreshed: Found ${regularNfts.length} NFTs and ${visibleCompressedNfts.length} cNFTs`);
                      }
                    })
                    .catch(error => {
                      console.error("Error refreshing NFTs:", error);
                      setError("Failed to refresh NFTs. Please try again.");
                    })
                    .finally(() => {
                      setIsRefreshing(false);
                    });
                }
              }}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Assets"}
            </button>
          </div>
          
          <RentEstimate 
            selectedTokens={selectedTokens}
            selectedNFTs={selectedNFTs}
            selectedCNFTs={selectedCNFTs}
          />
          
          {/* Bulk Burn Selection Panel - Always Visible */}
          {publicKey && (
            <div className="bulk-burn-section">
              <div className="bulk-burn-panel">
                <div className="bulk-burn-header">
                  <h3>Selected Assets</h3>
                  <span className="selection-count">
                    {selectedTokens.length + selectedNFTs.length + selectedCNFTs.length} items selected
                  </span>
                </div>
                
                {selectedTokens.length > 0 && (
                  <div className="selection-group">
                    <span>{selectedTokens.length} tokens selected</span>
                    <button 
                      className="bulk-burn-button"
                      disabled={isBurning} 
                      onClick={handleBulkBurnTokens}
                    >
                      Burn Selected Tokens
                    </button>
                  </div>
                )}
                
                {selectedNFTs.length > 0 && (
                  <div className="selection-group">
                    <span>{selectedNFTs.length} NFTs selected</span>
                    <button 
                      className="bulk-burn-button"
                      disabled={isBurning}
                      onClick={handleBulkBurnNFTs}
                    >
                      Burn Selected NFTs
                    </button>
                  </div>
                )}
                
                {selectedCNFTs.length > 0 && (
                  <div className="selection-group cnft-selection-group">
                    <span>{selectedCNFTs.length} cNFTs selected - View Only (Transfer disabled)</span>
                  </div>
                )}
                
                {(selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) && (
                  <div className="no-selection-message">
                    Click on any asset to select it. You can select multiple tokens/NFTs to burn or cNFTs to trash.
                  </div>
                )}
              </div>
            </div>
          )}
          
          {error && <div className="error-message">{error}</div>}
          
          {/* Token Section */}
          <div className="asset-section">
            <h3>Tokens {tokensLoading && <span className="loading-indicator">Loading...</span>}</h3>
            
            <div className="tokens-grid">
              {tokens.map((token) => (
                <div 
                  key={token.mint} 
                  className={`token-card ${bulkBurnMode && selectedTokens.includes(token.mint) ? 'selected' : ''}`} 
                  data-mint={token.mint}
                  onClick={bulkBurnMode ? () => handleTokenSelection(token.mint) : undefined}
                >
                  <div className="token-info">
                    <img 
                      src={token.logoURI || '/default-token-icon.svg'} 
                      alt={token.symbol || 'Token'} 
                      className="token-icon" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/default-token-icon.svg';
                      }}
                    />
                    <div className="token-details">
                      <div className="token-name">{token.name || `Token ${token.mint.slice(0, 8)}...`}</div>
                      <div className="token-symbol">{token.symbol || token.mint.slice(0, 4)}</div>
                      <div className="token-balance">
                        {formatTokenAmount(token.balance, token.decimals)}
                      </div>
                    </div>
                  </div>
                  {!bulkBurnMode && (
                    <button 
                      className="burn-button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBurnToken(token);
                      }}
                    >
                      Burn
                    </button>
                  )}
                  {bulkBurnMode && (
                    <div className="selection-indicator">
                      {selectedTokens.includes(token.mint) ? '✓' : ''}
                    </div>
                  )}
                </div>
              ))}
              
              {!tokensLoading && tokens.length === 0 && (
                <div className="no-assets-message">No tokens found in this wallet</div>
              )}
            </div>
          </div>
          
          {/* NFT Section */}
          <div className="asset-section">
            <h3>NFTs {nftsLoading && <span className="loading-indicator">Loading...</span>}</h3>
            
            <div className="nfts-grid">
              {nfts.map((nft) => (
                <div 
                  key={nft.mint} 
                  className={`nft-card ${bulkBurnMode && selectedNFTs.includes(nft.mint) ? 'selected' : ''}`} 
                  data-mint={nft.mint}
                  onClick={bulkBurnMode ? () => handleNFTSelection(nft.mint) : undefined}
                >
                  <div className="nft-info">
                    <img 
                      src={nft.image || '/default-nft-image.svg'} 
                      alt={nft.name || 'NFT'} 
                      className="nft-image" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/default-nft-image.svg';
                      }}
                    />
                    <div className="nft-details">
                      <div className="nft-name">{nft.name || `NFT ${nft.mint.slice(0, 8)}...`}</div>
                      {nft.collection && <div className="nft-collection">{nft.collection}</div>}
                    </div>
                  </div>
                  {!bulkBurnMode && (
                    <button 
                      className="burn-button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBurnNFT(nft);
                      }}
                    >
                      Burn
                    </button>
                  )}
                  {bulkBurnMode && (
                    <div className="selection-indicator">
                      {selectedNFTs.includes(nft.mint) ? '✓' : ''}
                    </div>
                  )}
                </div>
              ))}
              
              {!nftsLoading && nfts.length === 0 && (
                <div className="no-assets-message">No NFTs found in this wallet</div>
              )}
            </div>
          </div>
          
          {/* Compressed NFT Section */}
          <div className="asset-section">
            <h3>Compressed NFTs {cnftsLoading && <span className="loading-indicator">Loading...</span>}</h3>
            <div className="cnfts-grid">
              {cnfts.map((cnft) => (
                <div 
                  key={cnft.mint} 
                  className={`nft-card ${bulkBurnMode && selectedCNFTs.includes(cnft.mint) ? 'selected' : ''}`} 
                  data-mint={cnft.mint}
                  data-asset-id={cnft.mint}
                  onClick={bulkBurnMode ? () => handleCNFTSelection(cnft.mint) : undefined}
                >
                  <div className="nft-info">
                    <img 
                      src={cnft.image || '/default-nft-image.svg'} 
                      alt={cnft.name || 'cNFT'} 
                      className="nft-image" 
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/default-nft-image.svg';
                      }}
                    />
                    <div className="nft-details">
                      <div className="nft-name">{cnft.name || `cNFT ${cnft.mint.slice(0, 8)}...`}</div>
                      {cnft.collection && <div className="nft-collection">{cnft.collection}</div>}
                    </div>
                  </div>

                  {bulkBurnMode && (
                    <div className="selection-indicator">
                      {selectedCNFTs.includes(cnft.mint) ? '✓' : ''}
                    </div>
                  )}
                </div>
              ))}
              
              {!cnftsLoading && cnfts.length === 0 && (
                <div className="no-assets-message">No compressed NFTs found in this wallet</div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* DirectTrashModal for cNFT trash operations */}
      {directTrashModalOpen && selectedCnftForTrash && (
        <DirectTrashModal
          isOpen={directTrashModalOpen}
          onClose={() => setDirectTrashModalOpen(false)}
          assetId={selectedCnftForTrash.id}
          assetName={selectedCnftForTrash.name}
          assetImage={selectedCnftForTrash.image || '../../default-nft-image.svg'}
          onSuccess={handleDirectTrashSuccess}
          onError={handleDirectTrashError}
        />
      )}

      {/* DelegatedTransferModal for delegated cNFT transfers */}
      {delegatedTransferModalOpen && selectedCnftForDelegatedTransfer && (
        <DelegatedTransferModal
          isOpen={delegatedTransferModalOpen}
          onClose={() => setDelegatedTransferModalOpen(false)}
          assetId={selectedCnftForDelegatedTransfer.id}
          assetName={selectedCnftForDelegatedTransfer.name}
          assetImage={selectedCnftForDelegatedTransfer.image || '../../default-nft-image.svg'}
          onSuccess={handleDirectTrashSuccess}
        />
      )}

      {/* QueueTransferModal for bulk cNFT trash operations */}
      {queueTransferModalOpen && selectedCnftsForQueueTransfer && selectedCnftsForQueueTransfer.length > 0 && (
        <QueueTransferModal
          isOpen={queueTransferModalOpen}
          onClose={() => setQueueTransferModalOpen(false)}
          selectedAssets={selectedCnftsForQueueTransfer}
          wallet={publicKey ? publicKey.toString() : ''}
          onSuccess={handleQueueTransferSuccess}
        />
      )}
    </div>
  );
};

export default WalletAssets;