// Live test of the deposit lifecycle: tracks real deposits sent to the forwarding address activated by
// scripts/live-address.mjs until they are delivered, and checks the transfer mapping end to end.
//
// Enabled only when, in addition to the variables used by live.test.js, the environment provides
//   TEST_DEPOSIT_TXS          comma-separated "<sourceChainId>:<txHash>" entries of deposits already sent
//   TEST_DESTINATION_CHAIN    optional, default 42161 (must match the value used with scripts/live-address.mjs)
//   TEST_DEPOSIT_TIMEOUT_MS   optional polling budget per deposit, default 10 minutes
//
// A deposit is located as the newest forward from its source chain through the test forwarding address; the
// depositing address appears in `sourceAddresses`.
import { beforeAll, describe, expect, jest, test } from '@jest/globals'

import CandideForwardingProtocol from '../../index.js'

const { CANDIDE_FORWARDING_API_URL: apiUrl, TEST_RECIPIENT: recipient, TEST_DEPOSIT_TXS: txs } = process.env
const custodialWithdrawer = process.env.TEST_CUSTODIAL_WITHDRAWER || recipient
const destinationChain = Number(process.env.TEST_DESTINATION_CHAIN ?? 42161)
const enabled = Boolean(apiUrl && recipient && txs)

const deposits = (txs ?? '').split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
  const [chain, hash] = entry.split(':')
  if (!hash) throw new Error(`TEST_DEPOSIT_TXS entries must be "<sourceChainId>:<txHash>", got "${entry}"`)
  return { sourceChain: Number(chain), txHash: hash }
})

// Same salt as live.test.js and scripts/live-address.mjs.
const TEST_SALT = '0x' + 'ca'.repeat(31) + '01'
const FINAL = new Set(['completed', 'failed', 'refunded', 'expired'])
const POLL_MS = 5_000
const TIMEOUT_MS = Number(process.env.TEST_DEPOSIT_TIMEOUT_MS ?? 10 * 60 * 1000)

jest.setTimeout(TIMEOUT_MS + 30_000)

const maybe = enabled ? describe : describe.skip

if (!enabled) {
  console.warn('Skipping live deposit tests: set TEST_DEPOSIT_TXS=<chainId>:<txHash>,... (plus the live.test.js variables).')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

maybe('CandideForwardingProtocol deposit lifecycle (live)', () => {
  let protocol, proxyAddress

  beforeAll(async () => {
    protocol = new CandideForwardingProtocol(undefined, { apiUrl, custodialWithdrawer })
    proxyAddress = await protocol.deriveDepositAddress({ sourceChains: [destinationChain], destinationChain, destinationAddress: recipient, salt: TEST_SALT })
    console.log(`Tracking deposits through ${proxyAddress}`)
  })

  test.each(deposits)('tracks the deposit $txHash on chain $sourceChain to delivery', async ({ sourceChain, txHash }) => {
    const deadline = Date.now() + TIMEOUT_MS
    let transfers = []

    while (Date.now() < deadline) {
      const viaAddress = await protocol.getTransfers(proxyAddress, { limit: 20 })
      transfers = viaAddress.filter((t) => t.sourceChainId === sourceChain).slice(0, 1)
      if (transfers.length > 0 && transfers.every((t) => FINAL.has(t.status))) break
      console.log(`[${new Date().toISOString()}] ${txHash.slice(0, 12)}… ${transfers.length === 0 ? 'not detected yet' : transfers.map((t) => `${t.id}: ${t.status} (${t.providerStatus})`).join(', ')}`)
      await sleep(POLL_MS)
    }

    console.log(JSON.stringify(transfers, null, 2))

    expect(transfers.length).toBeGreaterThan(0)
    for (const transfer of transfers) {
      expect(transfer.status).toBe('completed')
      expect(transfer.providerStatus).toBe('delivered')
      expect(transfer.recipient.toLowerCase()).toBe(recipient.toLowerCase())
      expect(transfer.sourceChainId).toBe(sourceChain)
      expect(transfer.destinationChainId).toBe(destinationChain)
      expect(transfer.sourceTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
      expect(transfer.destinationTxHash).toMatch(/^0x[0-9a-fA-F]{64}$/)
      expect(transfer.proxyAddress.toLowerCase()).toBe(proxyAddress)
      expect(['across', 'layerzero', 'cctp', 'same_chain']).toContain(transfer.route)
      if (sourceChain === destinationChain) expect(transfer.route).toBe('same_chain')
      if (Array.isArray(transfer.sourceAddresses)) {
        expect(transfer.sourceAddresses.length).toBeGreaterThan(0)
        for (const entry of transfer.sourceAddresses) expect(BigInt(entry.amount)).toBeGreaterThan(0n)
      }

      // The same forward must be reachable through the other lookups.
      await expect(protocol.getTransfer(transfer.id)).resolves.toMatchObject({ id: transfer.id, status: 'completed' })
      const byRecipient = await protocol.getTransfersByRecipient(destinationChain, recipient)
      expect(byRecipient.map((t) => t.id)).toContain(transfer.id)
    }
  })
})
