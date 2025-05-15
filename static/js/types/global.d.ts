/**
 * Global type declarations for window objects and extensions
 */

interface Window {
  // For cached proof data for cNFT transfers
  cachedProofData?: Record<string, any>;
  
  // For debug information
  debugInfo?: {
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
  
  // For cNFT handler
  cnftHandler?: {
    CNFTHandler: any;
  };
  
  // For burn animations
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
  
  // For hiding assets
  HiddenAssets?: {
    hideAsset: (assetId: string, assetName: string, assetType: string) => boolean;
    unhideAsset: (assetId: string) => boolean;
    isAssetHidden: (assetId: string) => boolean;
    getHiddenAssets: () => Record<string, {id: string, name: string, type: string, dateHidden: string}>;
    getHiddenAssetsCount: () => number;
    clearHiddenAssets: () => boolean;
  };
  
  // For basic token transfers
  BasicTransfer?: {
    transfer: (connection: any, wallet: any, destinationAddress: string, amount: number) => Promise<any>;
  };
  
  // For standalone transfer implementation
  StandaloneTransfer?: {
    init: () => void;
    patchTransferButtons: () => void;
    handleTransfer: (assetId: string) => Promise<any>;
  };
  
  // For delegated transfer
  DelegatedTransfer?: {
    processDelegatedTransfer: (
      assetId: string,
      ownerAddress: string,
      signedMessage: string | null,
      delegateAddress: string | null,
      destinationAddress: string | null,
      providedProofData?: any
    ) => Promise<any>;
  };
  
  // For environment variables
  ENV?: {
    HELIUS_API_KEY?: string;
    SOLSCAN_API_KEY?: string;
    QUICKNODE_RPC_URL?: string;
    ENVIRONMENT?: string;
    TREE_INFO?: any;
  };
  
  // For app rendering
  App?: {
    render: () => void;
  };
}