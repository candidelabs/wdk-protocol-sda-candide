/**
 * Maps a JSON-RPC error into the WDK error hierarchy. The original code and message are kept in `cause`.
 *
 * @param {string} method - The RPC method that failed.
 * @param {{ code: number, message: string }} error - The JSON-RPC error object.
 * @returns {Error} The mapped error.
 */
export function toWdkError(method: string, error: {
    code: number;
    message: string;
}): Error;
/**
 * JSON-RPC error codes returned by the Candide Forwarding Address API.
 */
export type RpcErrorCode = number;
export namespace RpcErrorCode {
    let PARSE_ERROR: number;
    let INVALID_REQUEST: number;
    let METHOD_NOT_FOUND: number;
    let INVALID_PARAMS: number;
    let INTERNAL_ERROR: number;
    let ROUTE_NOT_FOUND: number;
    let QUOTE_UNAVAILABLE: number;
    let AMOUNT_TOO_SMALL: number;
    let AMOUNT_TOO_LARGE: number;
    let ADDRESS_NOT_FOUND: number;
    let UNAUTHORIZED: number;
    let ACCOUNT_DISABLED: number;
    let ADDRESS_LIMIT_EXCEEDED: number;
}
/**
 * Minimal JSON-RPC 2.0 client for the Candide Forwarding Address API.
 */
export default class CandideRpcClient {
    /**
     * Creates a new client.
     *
     * @param {Object} options - The client options.
     * @param {string} options.url - The JSON-RPC endpoint.
     * @param {string} [options.apiKey] - The account API key, required only for `account_*` methods.
     */
    constructor({ url, apiKey }: {
        url: string;
        apiKey?: string;
    });
    /** @private */
    private _url;
    /** @private */
    private _apiKey;
    /** @private */
    private _nextId;
    /**
     * Whether an API key was configured.
     *
     * @returns {boolean} True if an API key is available for authenticated methods.
     */
    get hasApiKey(): boolean;
    /**
     * Performs a JSON-RPC call.
     *
     * @param {string} method - The RPC method name.
     * @param {Object} [params] - The single params object (sent wrapped in a one-element array).
     * @param {Object} [options] - Call options.
     * @param {boolean} [options.auth] - Whether to attach the `Authorization: Bearer` header.
     * @returns {Promise<any>} The `result` field of the response.
     * @throws {ValueError} If `auth` is requested but no API key was configured, or the API rejected the params.
     * @throws {ProviderError} If the request fails at the transport level or the API returns a provider-side error.
     */
    call(method: string, params?: any, { auth }?: {
        auth?: boolean;
    }): Promise<any>;
}
