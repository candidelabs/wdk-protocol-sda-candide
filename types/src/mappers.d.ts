/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaToken} SdaToken */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaRoute} SdaRoute */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaDepositQuote} SdaDepositQuote */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransfer} SdaTransfer */
/** @typedef {import('@tetherto/wdk-wallet/protocols').SdaTransferStatus} SdaTransferStatus */
/**
 * A token as returned by `forwarding_getRoutes`.
 *
 * @typedef {Object} CandideRouteToken
 * @property {string} address - The token address on the source chain (lowercase).
 * @property {string} symbol - The token symbol.
 * @property {number} decimals - The token decimals on the source chain.
 * @property {string} destinationAddress - The token address on the destination chain (lowercase).
 * @property {number} feeBps - The Candide service fee in basis points.
 */
/**
 * A route as returned by `forwarding_getRoutes`.
 *
 * @typedef {Object} CandideRoute
 * @property {number} sourceChainId - The source chain id.
 * @property {string} sourceChainName - The source chain name.
 * @property {number} destinationChainId - The destination chain id.
 * @property {string} destinationChainName - The destination chain name.
 * @property {CandideRouteToken[]} tokens - The tokens accepted on this route.
 */
/**
 * An SDA token enriched with the Candide route fields.
 *
 * @typedef {SdaToken & { destinationAddress: string, feeBps: number }} CandideSdaToken
 */
/**
 * A forward (one processed deposit) as returned by the `forwarding_getForwards*` methods. Fields without a value are
 * omitted by the API.
 *
 * @typedef {Object} CandideForward
 * @property {string} forwardId - The opaque forward id (UUID).
 * @property {'pending' | 'delivered' | 'failed' | 'unknown'} status - The Candide status.
 * @property {'across' | 'layerzero' | 'cctp' | 'same_chain'} [route] - The bridge used.
 * @property {string} recipient - The recipient on the destination chain.
 * @property {number} sourceChainId - The source chain id.
 * @property {string} sourceTxHash - The source transaction hash.
 * @property {Array<{ address: string, amount: string }> | null} [sourceAddresses] - Depositors that funded this forward
 *   (`address` may be the literal `"redacted"` for dust entries).
 * @property {number} [destinationChainId] - The destination chain id.
 * @property {string} [destinationTxHash] - The delivery transaction hash on the destination chain.
 * @property {string} [proxyAddress] - The forwarding address that received the deposit.
 * @property {number} [sourceBlockTimestamp] - Unix timestamp of the source block.
 * @property {'refunded' | 'expired' | 'reverted'} [failureReason] - Why the forward failed.
 * @property {string} [refundTxHash] - The refund transaction hash (Across only).
 * @property {string} [providerSubStatus] - Raw upstream provider status, for debugging.
 * @property {number} [depositId] - Across deposit id.
 * @property {string} [guid] - LayerZero message GUID.
 */
/**
 * An SDA transfer enriched with the Candide forward fields.
 *
 * @typedef {SdaTransfer & {
 *   providerStatus: CandideForward['status'],
 *   route?: CandideForward['route'],
 *   recipient: string,
 *   sourceChainId: number,
 *   sourceTxHash: string,
 *   sourceAddresses?: CandideForward['sourceAddresses'],
 *   destinationChainId?: number,
 *   destinationTxHash?: string,
 *   proxyAddress?: string,
 *   sourceBlockTimestamp?: number,
 *   failureReason?: CandideForward['failureReason'],
 *   refundTxHash?: string
 * }} CandideTransfer
 */
/**
 * Maps a route token into an SDA token. The token identifier used in SDA calls is the source-chain contract address.
 *
 * @param {CandideRouteToken} token - The route token.
 * @param {number} chainId - The source chain id.
 * @returns {CandideSdaToken} The SDA token.
 */
export function toSdaToken(token: CandideRouteToken, chainId: number): CandideSdaToken;
/**
 * Maps a Candide route into an SDA route. `outputAsset` is left unset because every input token is delivered as its
 * own equivalent on the destination chain.
 *
 * @param {CandideRoute} route - The Candide route.
 * @returns {SdaRoute} The SDA route.
 */
export function toSdaRoute(route: CandideRoute): SdaRoute;
/**
 * The result of `forwarding_estimateOutput`.
 *
 * @typedef {Object} CandideEstimate
 * @property {number} destinationChainId - The destination chain id.
 * @property {string} outputToken - The delivered token address on the destination chain.
 * @property {string} outputTokenSymbol - The delivered token symbol.
 * @property {string} bridge - The bridge selected for this deposit.
 * @property {string} outputAmount - The delivered amount, in the output token's base unit.
 * @property {string} relayerBotFee - The Candide relayer fee, in the input token's base unit.
 * @property {string} bridgeProtocolFee - The bridge protocol fee, in the input token's base unit.
 */
/**
 * An SDA quote enriched with the Candide estimate fields.
 *
 * @typedef {SdaDepositQuote & { bridge: string, outputAssetSymbol: string }} CandideDepositQuote
 */
/**
 * Maps an estimate into an SDA quote.
 *
 * @param {{ sourceChainId: number, inputToken: string, inputAmount: bigint }} input - The normalized quote input.
 * @param {CandideEstimate} estimate - The estimate returned by the API.
 * @returns {CandideDepositQuote} The SDA quote.
 */
export function toSdaQuote(input: {
    sourceChainId: number;
    inputToken: string;
    inputAmount: bigint;
}, estimate: CandideEstimate): CandideDepositQuote;
/**
 * Maps a Candide forward status into an SDA transfer status. Candide only records a forward once a deposit has been
 * detected, so its `pending` corresponds to the SDA `processing` state.
 *
 * @param {CandideForward} forward - The forward.
 * @returns {SdaTransferStatus} The SDA status.
 */
export function toSdaTransferStatus(forward: CandideForward): SdaTransferStatus;
/**
 * Maps a Candide forward into an SDA transfer.
 *
 * @param {CandideForward} forward - The forward.
 * @returns {CandideTransfer} The SDA transfer.
 */
export function toSdaTransfer(forward: CandideForward): CandideTransfer;
export type SdaToken = import("@tetherto/wdk-wallet/protocols").SdaToken;
export type SdaRoute = import("@tetherto/wdk-wallet/protocols").SdaRoute;
export type SdaDepositQuote = import("@tetherto/wdk-wallet/protocols").SdaDepositQuote;
export type SdaTransfer = import("@tetherto/wdk-wallet/protocols").SdaTransfer;
export type SdaTransferStatus = import("@tetherto/wdk-wallet/protocols").SdaTransferStatus;
/**
 * A token as returned by `forwarding_getRoutes`.
 */
export type CandideRouteToken = {
    /**
     * - The token address on the source chain (lowercase).
     */
    address: string;
    /**
     * - The token symbol.
     */
    symbol: string;
    /**
     * - The token decimals on the source chain.
     */
    decimals: number;
    /**
     * - The token address on the destination chain (lowercase).
     */
    destinationAddress: string;
    /**
     * - The Candide service fee in basis points.
     */
    feeBps: number;
};
/**
 * A route as returned by `forwarding_getRoutes`.
 */
export type CandideRoute = {
    /**
     * - The source chain id.
     */
    sourceChainId: number;
    /**
     * - The source chain name.
     */
    sourceChainName: string;
    /**
     * - The destination chain id.
     */
    destinationChainId: number;
    /**
     * - The destination chain name.
     */
    destinationChainName: string;
    /**
     * - The tokens accepted on this route.
     */
    tokens: CandideRouteToken[];
};
/**
 * An SDA token enriched with the Candide route fields.
 */
export type CandideSdaToken = SdaToken & {
    destinationAddress: string;
    feeBps: number;
};
/**
 * A forward (one processed deposit) as returned by the `forwarding_getForwards*` methods. Fields without a value are
 * omitted by the API.
 */
export type CandideForward = {
    /**
     * - The opaque forward id (UUID).
     */
    forwardId: string;
    /**
     * - The Candide status.
     */
    status: "pending" | "delivered" | "failed" | "unknown";
    /**
     * - The bridge used.
     */
    route?: "across" | "layerzero" | "cctp" | "same_chain";
    /**
     * - The recipient on the destination chain.
     */
    recipient: string;
    /**
     * - The source chain id.
     */
    sourceChainId: number;
    /**
     * - The source transaction hash.
     */
    sourceTxHash: string;
    /**
     * - Depositors that funded this forward
     * (`address` may be the literal `"redacted"` for dust entries).
     */
    sourceAddresses?: Array<{
        address: string;
        amount: string;
    }> | null;
    /**
     * - The destination chain id.
     */
    destinationChainId?: number;
    /**
     * - The delivery transaction hash on the destination chain.
     */
    destinationTxHash?: string;
    /**
     * - The forwarding address that received the deposit.
     */
    proxyAddress?: string;
    /**
     * - Unix timestamp of the source block.
     */
    sourceBlockTimestamp?: number;
    /**
     * - Why the forward failed.
     */
    failureReason?: "refunded" | "expired" | "reverted";
    /**
     * - The refund transaction hash (Across only).
     */
    refundTxHash?: string;
    /**
     * - Raw upstream provider status, for debugging.
     */
    providerSubStatus?: string;
    /**
     * - Across deposit id.
     */
    depositId?: number;
    /**
     * - LayerZero message GUID.
     */
    guid?: string;
};
/**
 * An SDA transfer enriched with the Candide forward fields.
 */
export type CandideTransfer = SdaTransfer & {
    providerStatus: CandideForward["status"];
    route?: CandideForward["route"];
    recipient: string;
    sourceChainId: number;
    sourceTxHash: string;
    sourceAddresses?: CandideForward["sourceAddresses"];
    destinationChainId?: number;
    destinationTxHash?: string;
    proxyAddress?: string;
    sourceBlockTimestamp?: number;
    failureReason?: CandideForward["failureReason"];
    refundTxHash?: string;
};
/**
 * The result of `forwarding_estimateOutput`.
 */
export type CandideEstimate = {
    /**
     * - The destination chain id.
     */
    destinationChainId: number;
    /**
     * - The delivered token address on the destination chain.
     */
    outputToken: string;
    /**
     * - The delivered token symbol.
     */
    outputTokenSymbol: string;
    /**
     * - The bridge selected for this deposit.
     */
    bridge: string;
    /**
     * - The delivered amount, in the output token's base unit.
     */
    outputAmount: string;
    /**
     * - The Candide relayer fee, in the input token's base unit.
     */
    relayerBotFee: string;
    /**
     * - The bridge protocol fee, in the input token's base unit.
     */
    bridgeProtocolFee: string;
};
/**
 * An SDA quote enriched with the Candide estimate fields.
 */
export type CandideDepositQuote = SdaDepositQuote & {
    bridge: string;
    outputAssetSymbol: string;
};
