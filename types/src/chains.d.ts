/**
 * Normalizes a blockchain identifier to a numeric chain id.
 *
 * @param {Blockchain} chain - A numeric chain id, a numeric string, or a chain name from {@link CHAIN_IDS}.
 * @returns {number} The chain id.
 * @throws {ValueError} If the identifier is not a positive integer or a known chain name.
 */
export function toChainId(chain: Blockchain): number;
/** @typedef {import('@tetherto/wdk-wallet/protocols').Blockchain} Blockchain */
/**
 * Chain-name aliases accepted wherever a {@link Blockchain} is expected. Mirrors the names the Candide API returns in
 * `forwarding_getRoutes`. Numeric chain ids are always accepted; these aliases are a convenience only, the API is the
 * source of truth for which chains are actually supported.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const CHAIN_IDS: Readonly<Record<string, number>>;
export type Blockchain = import("@tetherto/wdk-wallet/protocols").Blockchain;
