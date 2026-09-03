/**
 * Candide's Forwarding Address as a WDK Smart Deposit Address protocol.
 *
 * One deterministic CREATE2 address per (recipient, custodial withdrawer, destination chain, salt) accepts deposits
 * on every supported EVM source chain, including the destination chain itself, and forwards each token as its own
 * equivalent to the recipient. Addresses are reusable; monitoring is time-limited and refreshed with
 * {@link CandideForwardingProtocol#renewDepositAddress}.
 */
export default class CandideForwardingProtocol extends SdaProtocol {
    /**
     * Creates a new Candide forwarding protocol without binding it to a wallet account.
     *
     * @overload
     * @param {undefined} [account] - The wallet account to use to interact with the protocol.
     * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
     */
    constructor(account?: undefined, config: CandideForwardingProtocolConfig);
    /**
     * Creates a new read-only Candide forwarding protocol.
     *
     * @overload
     * @param {IWalletAccountReadOnly} account - The wallet account to use to interact with the protocol.
     * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
     */
    constructor(account: IWalletAccountReadOnly, config: CandideForwardingProtocolConfig);
    /**
     * Creates a new Candide forwarding protocol.
     *
     * @overload
     * @param {IWalletAccount} account - The wallet account to use to interact with the protocol.
     * @param {CandideForwardingProtocolConfig} config - The protocol configuration.
     */
    constructor(account: IWalletAccount, config: CandideForwardingProtocolConfig);
    /**
     * The protocol configuration.
     *
     * @protected
     * @type {CandideForwardingProtocolConfig}
     */
    protected _config: CandideForwardingProtocolConfig;
    /** @private */
    private _rpc;
    /** @private */
    private _deployParams;
    /** @private */
    private _verifyAddresses;
    /** @private */
    private _routesCacheTtlMs;
    /** @private @type {Map<number, { fetchedAt: number, routes: CandideRoute[] }>} */
    private _routesCache;
    /**
     * Returns the derivation inputs currently in use (pinned factory, beacon and creation code, plus the relayer
     * reported by the API).
     *
     * @returns {Promise<CandideDeployParams>} The deploy params.
     * @throws {CandideForwardingError} If the API reports a deployment different from the one pinned in this SDK.
     */
    getDeployParams(): Promise<CandideDeployParams>;
    /**
     * Creates and activates a forwarding address. One address covers every requested source chain; the destination
     * chain is always monitored too, so same-chain deposits are forwarded as well.
     *
     * @param {CandideCreateDepositAddressOptions} options - The address creation options.
     * @returns {Promise<CandideDepositAddress[]>} A one-element array with the created address descriptor.
     * @throws {ValueError} If the options are not valid, or `destinationAddress` is omitted and no account is bound,
     *   or no API key was configured.
     * @throws {CandideForwardingError} If verification is enabled and the API returned an address different from the
     *   one derived client-side, or the Candide deployment changed.
     * @throws {ProviderError} If the API call fails.
     */
    createDepositAddress(options: CandideCreateDepositAddressOptions): Promise<CandideDepositAddress[]>;
    /**
     * Fetches a non-binding estimate of what a deposit would deliver, after the Candide relayer fee and the bridge fee.
     *
     * @param {SdaDepositOptions} options - The quote options. `outputAsset` is ignored: each token is delivered as its
     *   own equivalent on the destination chain.
     * @returns {Promise<CandideDepositQuote>} The quote.
     * @throws {ValueError} If the options are not valid, or the amount is below the bridge minimum or above its maximum.
     * @throws {SdaError} If the route is not supported.
     * @throws {ProviderError} If the API call fails or no quote is currently available.
     */
    quoteDeposit(options: SdaDepositOptions): Promise<CandideDepositQuote>;
    /**
     * Derives a forwarding address client-side, without activating it. Uses the factory, beacon and proxy creation code
     * pinned in this SDK and the relayer reported by the API (cached), so the only network call is the periodic relayer
     * refresh; pass `deployParams.allowedRelayer` in the configuration to make it fully offline.
     *
     * @param {CandideCreateDepositAddressOptions} options - The same options passed to `createDepositAddress`.
     * @returns {Promise<string>} The lowercase forwarding address.
     * @throws {ValueError} If the options are not valid, or `destinationAddress` is omitted and no account is bound.
     * @throws {CandideForwardingError} If the Candide deployment changed.
     */
    deriveDepositAddress(options: CandideCreateDepositAddressOptions): Promise<string>;
    /**
     * Looks up an existing forwarding address by its identifier (the address itself).
     *
     * @param {string} id - The forwarding address.
     * @returns {Promise<CandideDepositAddress>} The address descriptor.
     * @throws {ValueError} If the id is not an address.
     * @throws {NoSuchElementError} If the address has never been activated.
     * @throws {ProviderError} If the API call fails.
     */
    getDepositAddress(id: string): Promise<CandideDepositAddress>;
    /**
     * Refreshes the activation of a forwarding address on the source chains it was activated for.
     *
     * @param {string} id - The forwarding address.
     * @returns {Promise<CandideDepositAddress>} The refreshed address descriptor.
     * @throws {ValueError} If the id is not an address, or no API key was configured.
     * @throws {NoSuchElementError} If the address has never been activated.
     * @throws {CandideForwardingError} If the API re-derived a different address, or verification is enabled and the
     *   client-side derivation disagrees.
     * @throws {ProviderError} If the API call fails.
     */
    renewDepositAddress(id: string): Promise<CandideDepositAddress>;
    /**
     * Lists the deposits forwarded from a forwarding address.
     *
     * @param {string} address - The forwarding address.
     * @param {SdaTransfersOptions} [options] - Pagination and filtering. `sourceChain` is not needed: one address covers
     *   every source chain.
     * @returns {Promise<CandideTransfer[]>} The transfers, newest first.
     * @throws {ValueError} If the address is not valid.
     * @throws {NoSuchElementError} If the address has never been activated.
     * @throws {ProviderError} If the API call fails.
     */
    getTransfers(address: string, options?: SdaTransfersOptions): Promise<CandideTransfer[]>;
    /**
     * Lists every deposit forwarded to a recipient on a destination chain, across all of its forwarding addresses.
     *
     * @param {Blockchain} destinationChain - The destination chain.
     * @param {string} recipient - The recipient address.
     * @param {SdaTransfersOptions} [options] - Pagination and filtering.
     * @returns {Promise<CandideTransfer[]>} The transfers, newest first.
     * @throws {ValueError} If the arguments are not valid.
     * @throws {ProviderError} If the API call fails.
     */
    getTransfersByRecipient(destinationChain: Blockchain, recipient: string, options?: SdaTransfersOptions): Promise<CandideTransfer[]>;
    /**
     * Retrieves a single forward by its identifier.
     *
     * @param {string} id - The forward id returned in `CandideTransfer.id`.
     * @returns {Promise<CandideTransfer>} The transfer.
     * @throws {ValueError} If the id is not valid.
     * @throws {NoSuchElementError} If no forward exists with that id.
     * @throws {ProviderError} If the API call fails.
     */
    getTransfer(id: string): Promise<CandideTransfer>;
    /**
     * @private
     * @param {number} sourceChainId
     * @returns {Promise<CandideRoute[]>}
     */
    private _routes;
    /**
     * @private
     * @param {number} sourceChainId
     * @param {number} destinationChainId
     * @param {string} token
     * @returns {Promise<bigint | undefined>} The smallest minimum across bridges, or undefined if none is reported.
     */
    private _minimumAmount;
    /**
     * @private
     * @param {number[]} sourceChainIds
     * @param {number} destinationChainId
     * @returns {Promise<CandideSdaToken[]>}
     */
    private _inputTokensFor;
    /**
     * @private
     * @param {CandideCreateDepositAddressOptions} options
     * @returns {Promise<{ recipient: string, custodialWithdrawer: string, destinationChainId: number, sourceChainIds: number[], salt: string }>}
     */
    private _normalizeCreateOptions;
    /**
     * @private
     * @param {{ destinationAddress?: string }} options
     * @returns {Promise<string>}
     */
    private _destinationAddress;
    /**
     * @private
     * @param {{ recipient: string, custodialWithdrawer: string, destinationChainId: number, salt: string }} input
     * @returns {Promise<string>}
     */
    private _derive;
    /**
     * @private
     * @param {string} address
     * @param {{ recipient: string, custodialWithdrawer: string, destinationChainId: number, salt?: string }} stored
     * @param {{ sourceChains: Array<{ sourceChainId: number, status: string, expiresAt?: number, expiredAt?: number }> }} activation
     * @returns {Promise<CandideDepositAddress>}
     */
    private _describe;
    /**
     * Walks the cursor-paginated forwards of a recipient and applies the SDA filtering options.
     *
     * @private
     * @param {string} recipient
     * @param {number} destinationChainId
     * @param {SdaTransfersOptions} options
     * @param {(forward: CandideForward) => boolean} [predicate]
     * @returns {Promise<CandideTransfer[]>}
     */
    private _collectForwards;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type IWalletAccountReadOnly = import("@tetherto/wdk-wallet").IWalletAccountReadOnly;
export type Blockchain = import("@tetherto/wdk-wallet/protocols").Blockchain;
export type SdaRoutesOptions = import("@tetherto/wdk-wallet/protocols").SdaRoutesOptions;
export type SdaRoute = import("@tetherto/wdk-wallet/protocols").SdaRoute;
export type SdaDepositOptions = import("@tetherto/wdk-wallet/protocols").SdaDepositOptions;
export type SdaCreateDepositAddressOptions = import("@tetherto/wdk-wallet/protocols").SdaCreateDepositAddressOptions;
export type SdaDepositAddress = import("@tetherto/wdk-wallet/protocols").SdaDepositAddress;
export type SdaTransfersOptions = import("@tetherto/wdk-wallet/protocols").SdaTransfersOptions;
export type SdaRecoveryOptions = import("@tetherto/wdk-wallet/protocols").SdaRecoveryOptions;
export type SdaRecoveryResult = import("@tetherto/wdk-wallet/protocols").SdaRecoveryResult;
export type CandideDeployParams = import("./deploy-params.js").CandideDeployParams;
export type CandideRoute = import("./mappers.js").CandideRoute;
export type CandideSdaToken = import("./mappers.js").CandideSdaToken;
export type CandideDepositQuote = import("./mappers.js").CandideDepositQuote;
export type CandideForward = import("./mappers.js").CandideForward;
export type CandideTransfer = import("./mappers.js").CandideTransfer;
export type CandideForwardingProtocolConfig = {
    /**
     * - The Candide Forwarding Address JSON-RPC endpoint.
     */
    apiUrl: string;
    /**
     * - The account API key. Required for `createDepositAddress`, `renewDepositAddress` and
     * `recoverDepositAddress` (the only methods that call the authenticated `account_*` API); every other method works
     * without it.
     */
    apiKey?: string;
    /**
     * - The company-controlled wallet allowed to withdraw stuck funds after a
     * timelock, used for every address unless overridden per call. Strongly recommended: without it, funds sent from an
     * exchange or any wallet the recipient does not control on the source chain cannot be recovered. Defaults to the
     * recipient.
     */
    custodialWithdrawer?: string;
    /**
     * - Whether `createDepositAddress` derives the address client-side and compares
     * it with the address returned by the API. Defaults to `true`.
     */
    verifyAddresses?: boolean;
    /**
     * - Overrides for the pinned derivation inputs. Only needed
     * after a Candide redeployment that this SDK release does not know about. Pinning `allowedRelayer` too makes
     * derivation fully offline.
     */
    deployParams?: Partial<CandideDeployParams>;
    /**
     * - How long the relayer fetched from the API is cached, in milliseconds.
     * Defaults to 10 minutes.
     */
    deployParamsTtlMs?: number;
    /**
     * - How long `forwarding_getRoutes` results are cached per source chain, in
     * milliseconds. Defaults to 10 minutes.
     */
    routesCacheTtlMs?: number;
};
/**
 * Candide-specific options for creating or deriving a deposit address.
 */
export type CandideCreateDepositAddressOptions = SdaCreateDepositAddressOptions & {
    custodialWithdrawer?: string;
    salt?: string;
};
/**
 * A deposit address descriptor enriched with the Candide derivation inputs.
 */
export type CandideDepositAddress = SdaDepositAddress & {
    supportedInputTokens: CandideSdaToken[];
    custodialWithdrawer: string;
    salt: string;
};
import { SdaProtocol } from '@tetherto/wdk-wallet/protocols';
