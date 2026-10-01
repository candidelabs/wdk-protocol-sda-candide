// Smoke test of the Bare entry point: imports the package through bare.js, derives an address offline and, when
// CANDIDE_FORWARDING_API_URL is set, reads routes from the live API (public, read-only).
//
//   npx bare scripts/bare-smoke.mjs
import CandideForwardingProtocol, { PINNED_DEPLOY_PARAMS, computeProxyAddress, ZERO_SALT } from '../bare.js'

const derived = computeProxyAddress({
  ...PINNED_DEPLOY_PARAMS,
  allowedRelayer: '0x3333333333333333333333333333333333333333',
  recipient: '0x1111111111111111111111111111111111111111',
  recoveryWithdrawer: '0x2222222222222222222222222222222222222222',
  destinationChainId: 42161,
  salt: ZERO_SALT
})
console.log('derive', derived === '0xea040b7d4f1c21117a2e7a1ce1d0f2a7c53c895a' ? 'ok' : 'MISMATCH ' + derived)

const apiUrl = globalThis.process?.env?.CANDIDE_FORWARDING_API_URL
if (apiUrl) {
  const sda = new CandideForwardingProtocol(undefined, { apiUrl })
  const routes = await sda.getSupportedRoutes({ sourceChain: 1 })
  console.log('routes', routes.length > 0 ? `ok (${routes.length})` : 'EMPTY')
  const quote = await sda.quoteDeposit({ sourceChain: 1, inputToken: routes[0].inputTokens[0].token, destinationChain: routes[0].destinationChain, inputAmount: 100_000_000n })
  console.log('quote', typeof quote.outputAmount === 'bigint' ? 'ok' : 'BAD')
} else {
  console.log('routes skipped (no CANDIDE_FORWARDING_API_URL)')
}
