/**
 * Checks whether a value is a 0x-prefixed, 20-byte hex address.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is an address.
 */
export function isAddress(value: unknown): boolean;
/**
 * Checks whether a value is a 0x-prefixed, 32-byte hex string.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a bytes32.
 */
export function isBytes32(value: unknown): boolean;
/**
 * Converts a 0x-prefixed hex string into bytes.
 *
 * @param {string} hex - The hex string.
 * @returns {Uint8Array} The bytes.
 * @throws {ValueError} If the string is not valid even-length hex.
 */
export function hexToBytes(hex: string): Uint8Array;
/**
 * Converts bytes into a lowercase 0x-prefixed hex string.
 *
 * @param {Uint8Array} bytes - The bytes.
 * @returns {string} The hex string.
 */
export function bytesToHex(bytes: Uint8Array): string;
/**
 * Inputs needed to derive a forwarding address. Mirrors `ForwardingAddressFactory.computeProxyAddress`.
 *
 * @typedef {Object} ComputeProxyAddressParams
 * @property {string} recipient - The address that receives forwarded funds on the destination chain.
 * @property {string} recoveryWithdrawer - The address allowed to withdraw stuck funds after a timelock (the contract
 *   and the API call it `custodialWithdrawer`).
 * @property {number} destinationChainId - The destination chain id.
 * @property {string} allowedRelayer - The relayer address allowed to trigger forwarding.
 * @property {string} factory - The `ForwardingAddressFactory` address.
 * @property {string} singleton - The delegate target baked into the proxy (the beacon in production).
 * @property {string} proxyCreationCode - The `ForwardingAddressProxy` creation bytecode.
 * @property {string} [salt] - A 32-byte hex salt; defaults to {@link ZERO_SALT}.
 */
/**
 * Computes the deterministic CREATE2 forwarding address, client-side.
 *
 * `initData = initialize.selector ++ abi.encode(recipient, allowedRelayer, recoveryWithdrawer, destinationChainId)`
 * `bytecode = proxyCreationCode ++ abi.encode(singleton, initData)`
 * `address = keccak256(0xff ++ factory ++ salt ++ keccak256(bytecode))[12:]`
 *
 * Note the `initialize` argument order: the relayer comes second, before the recovery withdrawer.
 *
 * @param {ComputeProxyAddressParams} params - The derivation inputs.
 * @returns {string} The lowercase, 0x-prefixed forwarding address.
 * @throws {ValueError} If any input is malformed.
 */
export function computeProxyAddress(params: ComputeProxyAddressParams): string;
/** The default (all-zero) salt used when a caller does not request a distinct address. */
export const ZERO_SALT: string;
/**
 * Inputs needed to derive a forwarding address. Mirrors `ForwardingAddressFactory.computeProxyAddress`.
 */
export type ComputeProxyAddressParams = {
    /**
     * - The address that receives forwarded funds on the destination chain.
     */
    recipient: string;
    /**
     * - The address allowed to withdraw stuck funds after a timelock (the contract
     * and the API call it `custodialWithdrawer`).
     */
    recoveryWithdrawer: string;
    /**
     * - The destination chain id.
     */
    destinationChainId: number;
    /**
     * - The relayer address allowed to trigger forwarding.
     */
    allowedRelayer: string;
    /**
     * - The `ForwardingAddressFactory` address.
     */
    factory: string;
    /**
     * - The delegate target baked into the proxy (the beacon in production).
     */
    singleton: string;
    /**
     * - The `ForwardingAddressProxy` creation bytecode.
     */
    proxyCreationCode: string;
    /**
     * - A 32-byte hex salt; defaults to {@link ZERO_SALT}.
     */
    salt?: string;
};
