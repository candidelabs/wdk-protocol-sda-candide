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

import { keccak_256 as keccak256 } from '@noble/hashes/sha3'
import { ValueError } from '@tetherto/wdk-wallet/protocols'

/** The default (all-zero) salt used when a caller does not request a distinct address. */
export const ZERO_SALT = '0x' + '00'.repeat(32)

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/
const HEX_RE = /^0x([0-9a-fA-F]{2})*$/

/**
 * Checks whether a value is a 0x-prefixed, 20-byte hex address.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is an address.
 */
export function isAddress (value) {
  return typeof value === 'string' && ADDRESS_RE.test(value)
}

/**
 * Checks whether a value is a 0x-prefixed, 32-byte hex string.
 *
 * @param {unknown} value - The value to check.
 * @returns {boolean} Whether the value is a bytes32.
 */
export function isBytes32 (value) {
  return typeof value === 'string' && BYTES32_RE.test(value)
}

/**
 * Converts a 0x-prefixed hex string into bytes.
 *
 * @param {string} hex - The hex string.
 * @returns {Uint8Array} The bytes.
 * @throws {ValueError} If the string is not valid even-length hex.
 */
export function hexToBytes (hex) {
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) {
    throw new ValueError(`Invalid hex string: ${String(hex).slice(0, 20)}`)
  }
  const out = new Uint8Array((hex.length - 2) / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16)
  }
  return out
}

/**
 * Converts bytes into a lowercase 0x-prefixed hex string.
 *
 * @param {Uint8Array} bytes - The bytes.
 * @returns {string} The hex string.
 */
export function bytesToHex (bytes) {
  let s = '0x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

/**
 * @param {Uint8Array[]} arrays
 * @returns {Uint8Array}
 */
function concat (...arrays) {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0))
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} 32-byte, left-padded word
 */
function leftPad32 (bytes) {
  if (bytes.length > 32) throw new ValueError('Value does not fit in 32 bytes')
  const out = new Uint8Array(32)
  out.set(bytes, 32 - bytes.length)
  return out
}

/**
 * @param {string} address
 * @returns {Uint8Array}
 */
function encodeAddress (address) {
  return leftPad32(hexToBytes(address))
}

/**
 * @param {bigint} value
 * @returns {Uint8Array}
 */
function encodeUint256 (value) {
  if (typeof value !== 'bigint' || value < 0n || value >= (1n << 256n)) {
    throw new ValueError(`Invalid uint256: ${String(value)}`)
  }
  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = '0' + hex
  return leftPad32(hexToBytes('0x' + hex))
}

/**
 * @param {Uint8Array} bytes
 * @returns {Uint8Array} `abi.encode`-style dynamic bytes tail: length word + right-padded data
 */
function encodeBytesTail (bytes) {
  const padded = new Uint8Array(Math.ceil(bytes.length / 32) * 32)
  padded.set(bytes)
  return concat(encodeUint256(BigInt(bytes.length)), padded)
}

const INITIALIZE_SELECTOR = keccak256(new TextEncoder().encode('initialize(address,address,address,uint256)')).slice(0, 4)

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
export function computeProxyAddress (params) {
  const { recipient, recoveryWithdrawer, destinationChainId, allowedRelayer, factory, singleton, proxyCreationCode } = params
  const salt = params.salt ?? ZERO_SALT

  for (const [name, value] of Object.entries({ recipient, recoveryWithdrawer, allowedRelayer, factory, singleton })) {
    if (!isAddress(value)) throw new ValueError(`Invalid ${name} address: ${String(value)}`)
  }
  if (!isBytes32(salt)) throw new ValueError(`Invalid salt, expected a 32-byte hex value: ${String(salt)}`)
  if (!Number.isInteger(destinationChainId) || destinationChainId <= 0) {
    throw new ValueError(`Invalid destinationChainId: ${String(destinationChainId)}`)
  }

  const initData = concat(
    INITIALIZE_SELECTOR,
    encodeAddress(recipient),
    encodeAddress(allowedRelayer),
    encodeAddress(recoveryWithdrawer),
    encodeUint256(BigInt(destinationChainId))
  )

  // abi.encode(address singleton, bytes initData): two head words (address, offset = 0x40) then the bytes tail.
  const constructorArgs = concat(
    encodeAddress(singleton),
    encodeUint256(64n),
    encodeBytesTail(initData)
  )

  const bytecode = concat(hexToBytes(proxyCreationCode), constructorArgs)

  const digest = keccak256(concat(
    new Uint8Array([0xff]),
    hexToBytes(factory),
    hexToBytes(salt),
    keccak256(bytecode)
  ))

  return bytesToHex(digest.slice(12))
}
