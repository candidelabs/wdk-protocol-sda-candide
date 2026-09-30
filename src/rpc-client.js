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

import { ProviderErrorReason } from '@tetherto/wdk-wallet'
import { NoSuchElementError, ProviderError, SdaError, SdaErrorReason, ValueError } from '@tetherto/wdk-wallet/protocols'

/**
 * JSON-RPC error codes returned by the Candide Forwarding Address API.
 *
 * @readonly
 * @enum {number}
 */
export const RpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  ROUTE_NOT_FOUND: -32001,
  QUOTE_UNAVAILABLE: -32002,
  AMOUNT_TOO_SMALL: -32003,
  AMOUNT_TOO_LARGE: -32004,
  ADDRESS_NOT_FOUND: -32005,
  UNAUTHORIZED: -32011,
  ACCOUNT_DISABLED: -32012,
  ADDRESS_LIMIT_EXCEEDED: -32013
}

/**
 * Maps a JSON-RPC error into the WDK error hierarchy. The original code and message are kept in `cause`.
 *
 * @param {string} method - The RPC method that failed.
 * @param {{ code: number, message: string }} error - The JSON-RPC error object.
 * @returns {Error} The mapped error.
 */
export function toWdkError (method, error) {
  const code = error?.code
  const message = `${method}: ${error?.message ?? 'unknown error'} (${code})`
  const options = { cause: { code, message: error?.message } }

  switch (code) {
    case RpcErrorCode.INVALID_PARAMS:
    case RpcErrorCode.AMOUNT_TOO_SMALL:
    case RpcErrorCode.AMOUNT_TOO_LARGE:
      return new ValueError(message, options)
    case RpcErrorCode.ROUTE_NOT_FOUND:
      return new SdaError(message, { ...options, reason: SdaErrorReason.ROUTE_NOT_SUPPORTED })
    case RpcErrorCode.ADDRESS_NOT_FOUND:
      return new NoSuchElementError(message, options)
    case RpcErrorCode.UNAUTHORIZED:
      return new ProviderError(message, { ...options, reason: ProviderErrorReason.UNAUTHORIZED })
    case RpcErrorCode.ACCOUNT_DISABLED:
    case RpcErrorCode.ADDRESS_LIMIT_EXCEEDED:
      return new ProviderError(message, { ...options, reason: ProviderErrorReason.FORBIDDEN })
    default:
      return new ProviderError(message, { ...options, reason: ProviderErrorReason.INTERNAL_SERVER_ERROR })
  }
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
   * @param {string} [options.policySecret] - The forwarding policy secret, required only for `account_*` methods.
   */
  constructor ({ url, policySecret }) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new ValueError('\'apiUrl\' is required: the Forwarding Address API URL from the Candide dashboard.')
    }

    /** @private */
    this._url = url
    /** @private */
    this._policySecret = policySecret
    /** @private */
    this._nextId = 1
  }

  /**
   * Whether a policy secret was configured.
   *
   * @returns {boolean} True if a policy secret is available for authenticated methods.
   */
  get hasPolicySecret () {
    return typeof this._policySecret === 'string' && this._policySecret.length > 0
  }

  /**
   * Performs a JSON-RPC call.
   *
   * @param {string} method - The RPC method name.
   * @param {Object} [params] - The single params object (sent wrapped in a one-element array).
   * @param {Object} [options] - Call options.
   * @param {boolean} [options.auth] - Whether to attach the `Authorization: Bearer` header.
   * @returns {Promise<any>} The `result` field of the response.
   * @throws {ValueError} If `auth` is requested but no policy secret was configured, or the API rejected the params.
   * @throws {ProviderError} If the request fails at the transport level or the API returns a provider-side error.
   */
  async call (method, params = {}, { auth = false } = {}) {
    const headers = { 'content-type': 'application/json' }
    if (auth) {
      if (!this.hasPolicySecret) {
        throw new ValueError(`Method '${method}' requires the forwarding policy secret; pass 'policySecret' in the protocol configuration.`)
      }
      headers.authorization = `Bearer ${this._policySecret}`
    }

    const body = JSON.stringify({ jsonrpc: '2.0', id: this._nextId++, method, params: [params] })

    let response
    try {
      response = await fetch(this._url, { method: 'POST', headers, body })
    } catch (cause) {
      throw new ProviderError(`${method}: request failed (${cause?.message ?? cause})`, { cause, reason: ProviderErrorReason.NETWORK_ERROR })
    }

    if (!response.ok) {
      throw new ProviderError(`${method}: HTTP ${response.status} ${response.statusText ?? ''}`.trim(), { reason: ProviderErrorReason.NETWORK_ERROR })
    }

    let payload
    try {
      payload = await response.json()
    } catch (cause) {
      throw new ProviderError(`${method}: invalid JSON response`, { cause, reason: ProviderErrorReason.NETWORK_ERROR })
    }

    if (payload?.error) throw toWdkError(method, payload.error)

    return payload?.result
  }
}
