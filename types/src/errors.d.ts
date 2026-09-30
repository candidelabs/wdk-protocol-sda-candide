/**
 * Enum for Candide forwarding error reasons.
 */
export type CandideForwardingErrorReason = string;
export namespace CandideForwardingErrorReason {
    let ADDRESS_MISMATCH: string;
    let DEPLOYMENT_CHANGED: string;
}
/**
 * @typedef {Object} CandideForwardingErrorOptions
 * @property {CandideForwardingErrorReason} reason - The error's reason.
 */
/**
 * Thrown when a Candide-specific verification fails.
 */
export class CandideForwardingError extends WdkError {
    /**
     * Creates a new Candide forwarding error.
     *
     * @param {string} message - The error's message.
     * @param {CandideForwardingErrorOptions & ErrorOptions} options - The error's options.
     */
    constructor(message: string, options: CandideForwardingErrorOptions & ErrorOptions);
    /**
     * The error's reason.
     *
     * @type {CandideForwardingErrorReason}
     */
    reason: CandideForwardingErrorReason;
}
export type CandideForwardingErrorOptions = {
    /**
     * - The error's reason.
     */
    reason: CandideForwardingErrorReason;
};
import { WdkError } from '@tetherto/wdk-wallet/protocols';
