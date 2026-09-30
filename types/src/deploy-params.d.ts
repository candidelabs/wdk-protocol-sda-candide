/** @typedef {import('./rpc-client.js').default} CandideRpcClient */
/**
 * The inputs shared by every forwarding address derivation.
 *
 * @typedef {Object} CandideDeployParams
 * @property {string} factory - The `ForwardingAddressFactory` address.
 * @property {string} singleton - The delegate target baked into every proxy. In production this is the
 *   `ForwardingAddressBeacon`, so implementation upgrades do not change derived addresses.
 * @property {string} proxyCreationCode - The `ForwardingAddressProxy` creation bytecode.
 * @property {string} allowedRelayer - The relayer address allowed to trigger forwarding. Operational, not
 *   security-critical: the relayer can only forward funds to the recipient.
 * @property {string} [version] - A deployment version identifier, when the API provides one.
 */
/**
 * The deployment this SDK release was built against. Identical on every supported chain (deployed through the
 * Arachnid CREATE2 deployer). A change to any of these values changes every newly derived address and therefore
 * requires an SDK release; implementation upgrades behind the beacon do not.
 *
 * @type {Readonly<Omit<CandideDeployParams, 'allowedRelayer' | 'version'>>}
 */
export const PINNED_DEPLOY_PARAMS: Readonly<Omit<CandideDeployParams, "allowedRelayer" | "version">>;
/**
 * Resolves the deploy params used for client-side derivation: the pinned factory/beacon/creation code plus the
 * relayer reported by the API, verified against each other.
 */
export default class DeployParamsResolver {
    /**
     * Creates a new resolver.
     *
     * @param {Object} options - The resolver options.
     * @param {CandideRpcClient} options.rpc - The RPC client.
     * @param {Partial<CandideDeployParams>} [options.overrides] - Caller-supplied values that replace the pins. A field
     *   that is overridden is not checked against the API. Overriding `allowedRelayer` disables the API call entirely.
     * @param {number} [options.ttlMs] - How long a fetched relayer is cached, in milliseconds. Defaults to 10 minutes.
     * @param {Omit<CandideDeployParams, 'allowedRelayer' | 'version'>} [options.pinned] - The pinned values; defaults
     *   to {@link PINNED_DEPLOY_PARAMS}.
     */
    constructor({ rpc, overrides, ttlMs, pinned }: {
        rpc: CandideRpcClient;
        overrides?: Partial<CandideDeployParams>;
        ttlMs?: number;
        pinned?: Omit<CandideDeployParams, "allowedRelayer" | "version">;
    });
    /** @private */
    private _rpc;
    /** @private */
    private _overrides;
    /** @private */
    private _ttlMs;
    /** @private */
    private _pinned;
    /** @private @type {{ fetchedAt: number, params: CandideDeployParams } | undefined} */
    private _cache;
    /**
     * Returns the deploy params, fetching the relayer from the API when needed.
     *
     * @returns {Promise<CandideDeployParams>} The resolved deploy params.
     * @throws {CandideForwardingError} If the API reports a factory, beacon or creation code different from the pins.
     */
    resolve(): Promise<CandideDeployParams>;
    /**
     * Drops the cached relayer so the next {@link DeployParamsResolver#resolve} call hits the API again.
     */
    invalidate(): void;
}
export type CandideRpcClient = import("./rpc-client.js").default;
/**
 * The inputs shared by every forwarding address derivation.
 */
export type CandideDeployParams = {
    /**
     * - The `ForwardingAddressFactory` address.
     */
    factory: string;
    /**
     * - The delegate target baked into every proxy. In production this is the
     * `ForwardingAddressBeacon`, so implementation upgrades do not change derived addresses.
     */
    singleton: string;
    /**
     * - The `ForwardingAddressProxy` creation bytecode.
     */
    proxyCreationCode: string;
    /**
     * - The relayer address allowed to trigger forwarding. Operational, not
     * security-critical: the relayer can only forward funds to the recipient.
     */
    allowedRelayer: string;
    /**
     * - A deployment version identifier, when the API provides one.
     */
    version?: string;
};
