import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createBurnCheckedInstruction, 
  createCloseAccountInstruction
} from '@solana/spl-token';
import axios from 'axios';

// Add global variable to global window object to access in console for debugging
declare global {
  interface Window {
    debugInfo: {
      lastCnftError: any;
      lastCnftData: any;
      cnftBurnTriggered: boolean;
    };
  }
}

// Initialize debug object
if (typeof window !== 'undefined') {
  window.debugInfo = {
    lastCnftError: null,
    lastCnftData: null,
    cnftBurnTriggered: false
  };
}
import { CNFTHandler } from '../cnft-handler';

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
        
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: TOKEN_PROGRAM_ID }
        );
        
        console.log('[WalletAssets] Found token accounts:', tokenAccounts.value.length);
        
        const tokenData: TokenData[] = [];
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          if (Number(parsedInfo.tokenAmount.amount) > 0) {
            tokenData.push({
              mint: parsedInfo.mint,
              balance: Number(parsedInfo.tokenAmount.amount),
              decimals: parsedInfo.tokenAmount.decimals,
              account: account.pubkey.toBase58()
            });
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
        
        // Compressed NFTs are already in our expected format from the backend
        setCnfts(compressedNfts);
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
        
        console.log(`[WalletAssets] Found ${cnftList.length} compressed NFTs via CNFTHandler`);
        setCnfts(cnftList);
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

  // Function to handle trading compressed NFTs (cNFTs) to burn wallet
  const handleBurnCNFT = async (cnft: CNFTData) => {
    if (!publicKey || !signTransaction) {
      setError('Wallet connection required for trading cNFTs to burn wallet');
      return;
    }
    
    try {
      setError(`Starting trade-to-burn process for "${cnft.name}"...`);
      
      // Create a CNFTHandler instance
      const cnftHandler = new CNFTHandler(connection, {
        publicKey, 
        signTransaction,
        signMessage: (window as any).solana?.signMessage
      });
      
      // Let's track our debug info
      if (typeof window !== 'undefined' && window.debugInfo) {
        window.debugInfo.cnftBurnTriggered = true;
        window.debugInfo.lastCnftData = cnft;
        window.debugInfo.lastCnftError = 'Starting cNFT trade-to-burn process';
      }
      
      try {
        // Strategy 1: Try the server-side trade-to-burn approach first (newest approach)
        setError('Trying server-side trade-to-burn approach...');
        console.log("Using serverBurnCNFT method to trade cNFT to burn wallet:", cnft.mint);
        
        const serverResult = await cnftHandler.serverBurnCNFT(cnft.mint);
        
        if (serverResult.success) {
          // Server method succeeded!
          console.log("Server method succeeded!");
          handleBurnSuccess(cnft);
          return;
        } else if (serverResult.cancelled) {
          setError('Transaction was cancelled. Please try again if you want to trade this cNFT to burn wallet.');
          return;
        } else {
          console.log("Server method failed, falling back to direct method...");
          setError('First approach failed. Trying direct method...');
        }
        
        // Strategy 2: Try the direct trade-to-burn approach next
        // First, fetch the asset with proof
        setError('Fetching proof data...');
        const asset = await cnftHandler.fetchAssetWithProof(cnft.mint);
        
        if (!asset || !asset.proof) {
          setError('Could not fetch proof data. Cannot trade this cNFT to burn wallet.');
          return;
        }
        
        // Try our directBurnCNFT method (actually trades to burn wallet)
        setError('Trying direct trade-to-burn approach. Please approve in your wallet...');
        console.log("Using directBurnCNFT method to trade cNFT to burn wallet:", cnft.mint);
        const directResult = await cnftHandler.directBurnCNFT(cnft.mint, asset.proof);
        
        if (directResult.success) {
          // Direct method succeeded
          console.log("Direct method succeeded!");
          handleBurnSuccess(cnft);
          return;
        } else if (directResult.cancelled) {
          setError('Transaction was cancelled. Please try again if you want to trade this cNFT to burn wallet.');
          return;
        } else {
          console.log("Direct method failed, trying simpleBurnCNFT as final fallback...");
          setError('Second approach failed. Trying final fallback method...');
        }
        
        // Strategy 3: Try the original trade-to-burn method as last resort
        setError('Trying original trade-to-burn approach. Please approve in your wallet...');
        console.log("Using simpleBurnCNFT method to trade cNFT to burn wallet:", cnft.mint);
        const fallbackResult = await cnftHandler.simpleBurnCNFT(cnft.mint, asset.proof, cnft);
        
        if (fallbackResult.success) {
          // Fallback method succeeded
          console.log("Fallback method succeeded!");
          handleBurnSuccess(cnft);
          return;
        } else if (fallbackResult.cancelled) {
          setError('Transaction was cancelled. Please try again if you want to trade this cNFT to burn wallet.');
        } else {
          // All methods failed
          console.error("All trade-to-burn methods failed!");
          setError(`Error trading cNFT to burn wallet: All methods failed. ${fallbackResult.error || 'Unknown error'}`);
        }
      } catch (innerError: any) {
        console.error('Error in cNFT trade-to-burn operation:', innerError);
        
        if (innerError.message && (
            innerError.message.includes('cancel') || 
            innerError.message.includes('reject') || 
            innerError.message.includes('User'))) {
          setError('Transaction was cancelled. Please try again if you want to trade this cNFT to burn wallet.');
        } else {
          setError(`Error trading cNFT to burn wallet: ${innerError.message}`);
        }
      }
    } catch (error: any) {
      console.error('Error trading cNFT to burn wallet:', error);
      setError(`Error trading cNFT to burn wallet: ${error.message}`);
    }
  };
  
  // Helper function to handle successful cNFT trades to burn wallet
  const handleBurnSuccess = (cnft: CNFTData) => {
    // Update the cNFTs list by removing the traded cNFT
    const updatedCnfts = cnfts.filter(c => c.mint !== cnft.mint);
    setCnfts(updatedCnfts);
    
    // Apply animations
    if (window.BurnAnimations) {
      // Find the cNFT card element for trade-to-burn animation
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
    setError(`Successfully traded compressed NFT "${cnft.name || 'cNFT'}" to burn wallet! Compressed NFTs don't return rent as they are already efficiently stored on-chain.`);
    setTimeout(() => setError(null), 5000);
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

  // Handle bulk burn of tokens
  const handleBulkBurnTokens = async () => {
    if (selectedTokens.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk burn operation for tokens...");
    
    try {
      let successCount = 0;
      
      for (const mint of selectedTokens) {
        const token = tokens.find(t => t.mint === mint);
        if (token) {
          try {
            // Burn the token and await result
            await handleBurnToken(token);
            successCount++;
          } catch (error) {
            console.error(`Error burning token ${mint}:`, error);
            // Continue with next token
          }
        }
      }
      
      setError(`Successfully burned ${successCount} of ${selectedTokens.length} tokens!`);
      
      // Clear selections after burning
      setSelectedTokens([]);
    } catch (error: any) {
      setError(`Error in bulk burn operation: ${error.message}`);
    } finally {
      setIsBurning(false);
    }
  };

  // Handle bulk burn of NFTs
  const handleBulkBurnNFTs = async () => {
    if (selectedNFTs.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk burn operation for NFTs...");
    
    try {
      let successCount = 0;
      
      for (const mint of selectedNFTs) {
        const nft = nfts.find(n => n.mint === mint);
        if (nft) {
          try {
            // Burn the NFT and await result
            await handleBurnNFT(nft);
            successCount++;
          } catch (error) {
            console.error(`Error burning NFT ${mint}:`, error);
            // Continue with next NFT
          }
        }
      }
      
      setError(`Successfully burned ${successCount} of ${selectedNFTs.length} NFTs!`);
      
      // Clear selections after burning
      setSelectedNFTs([]);
    } catch (error: any) {
      setError(`Error in bulk burn operation: ${error.message}`);
    } finally {
      setIsBurning(false);
    }
  };

  // Handle bulk trade-to-burn of cNFTs
  const handleBulkBurnCNFTs = async () => {
    if (selectedCNFTs.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk trade-to-burn operation for compressed NFTs...");
    
    try {
      let successCount = 0;
      let cancelledCount = 0;
      let failedCount = 0;
      let continueProcessing = true;
      
      for (let i = 0; i < selectedCNFTs.length && continueProcessing; i++) {
        const mint = selectedCNFTs[i];
        const cnft = cnfts.find(c => c.mint === mint);
        
        if (cnft) {
          try {
            // Wait a moment between operations to avoid wallet UI confusion
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Get the cNFT handler
            const cnftHandler = new CNFTHandler(connection, {
              publicKey, 
              signTransaction
            });
            
            // Get the proof data
            const asset = await cnftHandler.fetchAssetWithProof(mint);
            
            if (asset && asset.proof) {
              // Try the new directBurnCNFT method first
              console.log("Trying to trade cNFT to burn wallet - assetId:", mint);
              const result = await cnftHandler.directBurnCNFT(mint, asset.proof);
              
              if (result.success) {
                console.log("Successfully traded cNFT to burn wallet - assetId:", mint);
                successCount++;
                // Remove the cNFT from the list
                setCnfts(prev => prev.filter(c => c.mint !== mint));
                
                // Apply animations
                const element = document.querySelector(`.nft-card[data-mint="${mint}"]`) as HTMLElement;
                if (element && window.BurnAnimations) {
                  window.BurnAnimations.applyBurnAnimation(element);
                  if (window.BurnAnimations.checkAchievements) {
                    window.BurnAnimations.checkAchievements('cnfts', 1);
                  }
                }
              } else if (result.cancelled) {
                console.log("Trading cNFT to burn wallet was cancelled - assetId:", mint);
                cancelledCount++;
                // If the user cancelled, stop processing more
                continueProcessing = false;
                setError('Transaction was cancelled. Stopping bulk operation.');
              } else {
                console.log("Trading cNFT to burn wallet failed - assetId:", mint, "Error:", result.error);
                failedCount++;
                // Show specific error for debugging
                setError(`Error trading cNFT to burn wallet: ${result.error}`);
              }
            } else {
              console.error(`Could not fetch proof data for cNFT ${mint}`);
              failedCount++;
            }
          } catch (error) {
            console.error(`Error trading cNFT ${mint} to burn wallet:`, error);
            failedCount++;
            // Check if this is a wallet error that should stop processing
            if (error instanceof Error && 
                (error.message.includes('wallet') || 
                 error.message.includes('cancel') || 
                 error.message.includes('reject'))) {
              continueProcessing = false;
              setError('Wallet interaction was cancelled. Stopping bulk operation.');
            }
          }
        }
      }
      
      // Show final summary message
      if (successCount > 0) {
        setError(`Successfully traded ${successCount} of ${selectedCNFTs.length} compressed NFTs to burn wallet!` + 
          (failedCount > 0 ? ` ${failedCount} failed.` : '') +
          (cancelledCount > 0 ? ` ${cancelledCount} cancelled.` : ''));
          
        // Show confetti for success
        if (window.BurnAnimations && window.BurnAnimations.createConfetti) {
          window.BurnAnimations.createConfetti();
        }
          
        // Clear selections for successful burns only
        setSelectedCNFTs(prev => {
          // Keep only the ones that failed or were cancelled
          const remainingAssets = cnfts.filter(c => prev.includes(c.mint)).map(c => c.mint);
          return remainingAssets;
        });
      } else {
        setError(`No cNFTs were traded to burn wallet. ${failedCount} failed, ${cancelledCount} cancelled.`);
      }
    } catch (error: any) {
      setError(`Error in bulk trade-to-burn operation: ${error.message}`);
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
          <h2>Your Wallet Assets</h2>
          
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
                  <div className="selection-group">
                    <span>{selectedCNFTs.length} cNFTs selected</span>
                    <button 
                      className="bulk-burn-button"
                      disabled={isBurning}
                      onClick={handleBulkBurnCNFTs}
                    >
                      Trade Selected cNFTs to Burn Wallet
                    </button>
                  </div>
                )}
                
                {(selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) && (
                  <div className="no-selection-message">
                    Click on any asset to select it. You can select multiple tokens/NFTs to burn or cNFTs to trade to the burn wallet.
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
            <div className="info-message" style={{ marginBottom: '10px', fontSize: '0.9rem', color: '#555', background: '#f8f8f8', padding: '8px', borderRadius: '4px' }}>
              Note: Compressed NFTs are traded to a burn wallet address (111111...) instead of being directly burned. The effect is the same - the cNFT is permanently removed from circulation.
            </div>
            
            <div className="cnfts-grid">
              {cnfts.map((cnft) => (
                <div 
                  key={cnft.mint} 
                  className={`nft-card ${bulkBurnMode && selectedCNFTs.includes(cnft.mint) ? 'selected' : ''}`} 
                  data-mint={cnft.mint}
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
                  {!bulkBurnMode && (
                    <button 
                      className="burn-button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBurnCNFT(cnft);
                      }}
                      title="Sends to a burn wallet address"
                    >
                      Trade to Burn
                    </button>
                  )}
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
    </div>
  );
};

export default WalletAssets;