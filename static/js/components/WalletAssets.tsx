import React, { useState, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  createBurnCheckedInstruction, 
  createCloseAccountInstruction
} from '@solana/spl-token';
import axios from 'axios';
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
      // Create a transaction with multiple instructions:
      // 1. Burn the token amount
      // 2. Close the token account to recover rent
      // 3. Transfer a small amount of SOL to the designated address
      const transaction = new Transaction();
      
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
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Sign and send the transaction
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature);
      
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
    } catch (error: any) {
      console.error('Error burning token:', error);
      setError(`Error burning token: ${error.message}`);
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
      // We need tokenAddress and metadataAddress to burn an NFT
      if (!nft.tokenAddress) {
        console.error('Token account address is required for burning NFT');
        setError('Could not find the token account for this NFT');
        return;
      }
      
      // Create a transaction to close the token account (burn the NFT)
      const transaction = new Transaction();
      
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
      
      // 2. Find and close the metadata account to recover rent
      if (nft.metadataAddress) {
        try {
          const metadataProgramId = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
          
          // Create a metadata program revoke instruction to update ownership before closing
          // This allows us to properly close the metadata account
          const revokeInstruction = new TransactionInstruction({
            keys: [
              { pubkey: new PublicKey(nft.metadataAddress), isSigner: false, isWritable: true },
              { pubkey: publicKey, isSigner: true, isWritable: false },
            ],
            programId: metadataProgramId,
            data: Buffer.from([7]), // Revoke instruction code for metadata program
          });
          
          // Add revoke instruction
          transaction.add(revokeInstruction);
          
          // After revoking, we can close the account to recover the rent
          const closeInstruction = new TransactionInstruction({
            keys: [
              { pubkey: new PublicKey(nft.metadataAddress), isSigner: false, isWritable: true },
              { pubkey: publicKey, isSigner: true, isWritable: true }, // Destination for recovered rent
              { pubkey: publicKey, isSigner: true, isWritable: false }, // Authority
            ],
            programId: metadataProgramId,
            data: Buffer.from([8]), // Close account instruction code
          });
          
          // Add close instruction
          transaction.add(closeInstruction);
        } catch (error) {
          console.warn('Could not add metadata account closing instruction:', error);
        }
      }
      
      // 3. Close the mint account to recover rent
      try {
        const closeAccountInstruction = new TransactionInstruction({
          keys: [
            { pubkey: new PublicKey(nft.mint), isSigner: false, isWritable: true },
            { pubkey: publicKey, isSigner: false, isWritable: true }, // Destination for rent
            { pubkey: publicKey, isSigner: true, isWritable: false }, // Authority
          ],
          programId: TOKEN_PROGRAM_ID,
          data: Buffer.from([9]), // Close mint account instruction code
        });
        
        // Add close mint instruction
        transaction.add(closeAccountInstruction);
      } catch (error) {
        console.warn('Could not add mint account closing instruction:', error);
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
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Sign and send the transaction
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature);
      
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
        setError(`Successfully burned NFT "${nft.name || 'NFT'}" and recovered rent from token, metadata, and mint accounts to your wallet! A small donation has been sent to support the project.`);
        setTimeout(() => setError(null), 7000); // Clear message after 7 seconds since it's longer
      }
    } catch (error: any) {
      console.error('Error burning NFT:', error);
      setError(`Error burning NFT: ${error.message}`);
    }
  };

  // Function to handle burning compressed NFTs (cNFTs)
  const handleBurnCNFT = async (cnft: CNFTData) => {
    console.log('Burning cNFT:', cnft);
    
    if (!publicKey || !signTransaction) {
      console.error('Wallet connection required for burning cNFTs');
      setError('Wallet connection required for burning cNFTs');
      return;
    }
    
    try {
      // Use the CNFTHandler to burn the compressed NFT
      const cnftHandler = new CNFTHandler(connection, {
        publicKey, 
        signTransaction
      });
      
      // The assetId for cNFTs is the mint address
      const assetId = cnft.mint;
      
      // First, fetch the asset proof directly using the handler
      console.log(`Fetching proof data directly for ${assetId}`);
      setError('Fetching proof data for this cNFT...');
      
      try {
        // Try to fetch the asset with proof first
        const asset = await cnftHandler.fetchAssetWithProof(assetId);
        if (asset && asset.proof) {
          console.log('Successfully fetched proof data from blockchain');
          
          // We'll try the simplified method first
          const result = await cnftHandler.simpleBurnCNFT(assetId, asset.proof, cnft);
          
          // Check if the transaction was cancelled by the user
          if (result.cancelled) {
            console.log('Transaction was cancelled by the user');
            setError('Transaction was cancelled. Please try again if you want to burn this asset.');
            return;
          }
          
          // Only try the full burn method if simple method fails and it wasn't a cancellation
          if (!result.success && !result.cancelled) {
            console.log('Simplified burn method failed, attempting full burn...');
            // Try the full burning method as a fallback if the simple one fails
            const fullResult = await cnftHandler.burnCNFT(assetId, asset.proof, cnft);
            if (fullResult.success) {
              // Update the results to reflect the successful full burn
              result.success = fullResult.success;
              result.signature = fullResult.signature;
              // Copy the message if available, otherwise use a default
              if ('message' in fullResult) {
                (result as any).message = fullResult.message;
              }
            }
          }
      
          if (result.success) {
            console.log('cNFT burn successful with signature:', result.signature);
            
            // Update the cNFTs list by removing the burnt cNFT
            const updatedCnfts = cnfts.filter(c => c.mint !== cnft.mint);
            setCnfts(updatedCnfts);
            
            // Apply animations if available
            if (window.BurnAnimations) {
              // Find the cNFT card element for burn animation
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
            
            // Show message about the successful burn
            // Note: cNFTs don't return rent to the user as they're already efficiently stored on-chain
            setError(`Successfully burned compressed NFT "${cnft.name || 'cNFT'}"! Compressed NFTs don't return rent as they are already efficiently stored on-chain.`);
            setTimeout(() => setError(null), 5000); // Clear message after 5 seconds
          } else if (!result.cancelled) {
            // Only show an error if it wasn't a user cancellation
            console.error('Error burning cNFT:', result.error);
            setError(`Error burning cNFT: ${result.error}`);
          }
        } else {
          setError('Could not fetch proof data for this cNFT. Cannot burn without merkle proof.');
        }
      } catch (innerError: any) {
        console.error('Error fetching proof data:', innerError);
        
        // Check for cancellation or wallet errors
        if (innerError.message && (
            innerError.message.includes('cancel') || 
            innerError.message.includes('reject') || 
            innerError.message.includes('wallet') ||
            innerError.message.includes('User') ||
            innerError.message.includes('timeout'))) {
          setError('Transaction was cancelled. Please try again if you want to burn this asset.');
        } else {
          setError(`Error fetching proof data: ${innerError.message}`);
        }
      }
    } catch (error: any) {
      console.error('Error burning cNFT:', error);
      
      // User-friendly error message for wallet connection issues
      if (error.message && (
          error.message.includes('wallet') ||
          error.message.includes('connection') ||
          error.message.includes('adapter'))) {
        setError('Wallet connection error. Please ensure your wallet is unlocked and try again.');
      } else {
        setError(`Error burning cNFT: ${error.message}`);
      }
    }
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

  // Handle bulk burn of cNFTs
  const handleBulkBurnCNFTs = async () => {
    if (selectedCNFTs.length === 0) return;
    
    setIsBurning(true);
    setError("Starting bulk burn operation for compressed NFTs...");
    
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
            // Wait a moment between burns to avoid wallet UI confusion
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
              // Call the simpleBurnCNFT method directly
              const result = await cnftHandler.simpleBurnCNFT(mint, asset.proof, cnft);
              
              if (result.success) {
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
                cancelledCount++;
                // If the user cancelled, stop processing more
                continueProcessing = false;
                setError('Transaction was cancelled. Stopping bulk operation.');
              } else {
                failedCount++;
              }
            } else {
              console.error(`Could not fetch proof data for cNFT ${mint}`);
              failedCount++;
            }
          } catch (error) {
            console.error(`Error burning cNFT ${mint}:`, error);
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
        setError(`Successfully burned ${successCount} of ${selectedCNFTs.length} compressed NFTs!` + 
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
        setError(`No cNFTs were burned. ${failedCount} failed, ${cancelledCount} cancelled.`);
      }
    } catch (error: any) {
      setError(`Error in bulk burn operation: ${error.message}`);
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
                      Burn Selected cNFTs
                    </button>
                  </div>
                )}
                
                {(selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) && (
                  <div className="no-selection-message">
                    Click on any asset to select it for burning. You can select multiple assets to burn in bulk.
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
                    >
                      Burn
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