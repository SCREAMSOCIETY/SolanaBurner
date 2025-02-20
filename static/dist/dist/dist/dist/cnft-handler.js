var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) {
            try {
                step(generator.next(value));
            }
            catch (e) {
                reject(e);
            }
        }
        function rejected(value) {
            try {
                step(generator["throw"](value));
            }
            catch (e) {
                reject(e);
            }
        }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function () {
            if (t[0] & 1)
                throw t[1];
            return t[1];
        }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function () { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f)
            throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _)
            try {
                if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done)
                    return t;
                if (y = 0, t)
                    op = [op[0] & 2, t.value];
                switch (op[0]) {
                    case 0:
                    case 1:
                        t = op;
                        break;
                    case 4:
                        _.label++;
                        return { value: op[1], done: false };
                    case 5:
                        _.label++;
                        y = op[1];
                        op = [0];
                        continue;
                    case 7:
                        op = _.ops.pop();
                        _.trys.pop();
                        continue;
                    default:
                        if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                            _ = 0;
                            continue;
                        }
                        if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                            _.label = op[1];
                            break;
                        }
                        if (op[0] === 6 && _.label < t[1]) {
                            _.label = t[1];
                            t = op;
                            break;
                        }
                        if (t && _.label < t[2]) {
                            _.label = t[2];
                            _.ops.push(op);
                            break;
                        }
                        if (t[2])
                            _.ops.pop();
                        _.trys.pop();
                        continue;
                }
                op = body.call(thisArg, _);
            }
            catch (e) {
                op = [6, e];
                y = 0;
            }
            finally {
                f = t = 0;
            }
        if (op[0] & 5)
            throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import { Connection } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import { createTree, getMerkleTree, getAssetWithProof, getLeafAssetId } from '@metaplex-foundation/mpl-bubblegum';
var CNFTHandler = /** @class */ (function () {
    function CNFTHandler(connection, wallet) {
        this.connection = connection;
        this.wallet = wallet;
        this.metaplex = new Metaplex(connection);
    }
    CNFTHandler.prototype.fetchCNFTs = function (walletAddress) {
        return __awaiter(this, void 0, void 0, function () {
            var assetIds, cnfts, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        console.log('Fetching cNFTs for wallet:', walletAddress);
                        return [4 /*yield*/, this.metaplex.nfts().findAllByOwner({
                                owner: walletAddress,
                                compressed: true
                            })];
                    case 1:
                        assetIds = _a.sent();
                        console.log("Found ".concat(assetIds.length, " cNFTs"));
                        return [4 /*yield*/, Promise.all(assetIds.map(function (assetId) {
                                return __awaiter(_this, void 0, void 0, function () {
                                    var asset, metadata, error_2;
                                    var _a;
                                    return __generator(this, function (_b) {
                                        switch (_b.label) {
                                            case 0:
                                                _b.trys.push([0, 2, , 3]);
                                                return [4 /*yield*/, getAssetWithProof(this.connection, assetId)];
                                            case 1:
                                                asset = _b.sent();
                                                metadata = asset.metadata;
                                                return [2 /*return*/, {
                                                        mint: assetId.toString(),
                                                        name: metadata.name,
                                                        symbol: metadata.symbol,
                                                        description: metadata.description,
                                                        image: metadata.image,
                                                        collection: (_a = metadata.collection) === null || _a === void 0 ? void 0 : _a.name,
                                                        attributes: metadata.attributes,
                                                        explorer_url: "https://solscan.io/token/".concat(assetId),
                                                        proof: asset.proof
                                                    }];
                                            case 2:
                                                error_2 = _b.sent();
                                                console.error("Error fetching cNFT metadata for ".concat(assetId, ":"), error_2);
                                                return [2 /*return*/, null];
                                            case 3: return [2 /*return*/];
                                        }
                                    });
                                });
                            }))];
                    case 2:
                        cnfts = _a.sent();
                        // Filter out failed fetches
                        return [2 /*return*/, cnfts.filter(function (cnft) { return cnft !== null; })];
                    case 3:
                        error_1 = _a.sent();
                        console.error('Error in fetchCNFTs:', error_1);
                        throw error_1;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    CNFTHandler.prototype.burnCNFT = function (assetId, proof) {
        return __awaiter(this, void 0, void 0, function () {
            var leafId, tree, burnIx, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        return [4 /*yield*/, getLeafAssetId(assetId)];
                    case 1:
                        leafId = _a.sent();
                        return [4 /*yield*/, getMerkleTree(this.connection, leafId.treeId)];
                    case 2:
                        tree = _a.sent();
                        return [4 /*yield*/, this.metaplex.nfts().builders().burn({
                                mintAddress: assetId,
                                collection: tree.collection,
                                proof: proof,
                                compressed: true
                            })];
                    case 3:
                        burnIx = _a.sent();
                        return [2 /*return*/, burnIx];
                    case 4:
                        error_3 = _a.sent();
                        console.error('Error creating burn instruction for cNFT:', error_3);
                        throw error_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return CNFTHandler;
}());
export { CNFTHandler };
