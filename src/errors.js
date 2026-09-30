// Copyright 2026 Candide Labs
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { WdkError } from '@tetherto/wdk-wallet/protocols'

/**
 * Enum for Candide forwarding error reasons.
 *
 * @readonly
 * @enum {string}
 */
export const CandideForwardingErrorReason = {
  /**
   * Thrown when the address returned by the Candide API does not match the address derived client-side from the
   * same inputs. The server-side activation has already happened; do not send funds to either address until the
   * discrepancy is understood.
   */
  ADDRESS_MISMATCH: 'ADDRESS_MISMATCH',
  /**
   * Thrown when the Candide API reports a factory, beacon or proxy creation code different from the values pinned in
   * this SDK. Upgrade the SDK, or pass `deployParams` in the configuration if you have verified the new deployment.
   */
  DEPLOYMENT_CHANGED: 'DEPLOYMENT_CHANGED'
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
  constructor (message, options) {
    super(message, options)

    this.name = 'CandideForwardingError'

    /**
     * The error's reason.
     *
     * @type {CandideForwardingErrorReason}
     */
    this.reason = options.reason
  }
}
