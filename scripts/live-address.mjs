// Activates (or refreshes) the forwarding address used by the live deposit tests and prints everything needed to
// fund it: the address, the accepted tokens per source chain, and the per-bridge minimums.
//
//   npm run live:address
//
// Reads CANDIDE_FORWARDING_API_URL, CANDIDE_FORWARDING_POLICY_SECRET, TEST_RECIPIENT, TEST_CUSTODIAL_WITHDRAWER (optional)
// and TEST_DESTINATION_CHAIN (optional, default 42161 / Arbitrum) from the environment (.env is loaded by npm script).
import CandideForwardingProtocol, { CHAIN_IDS } from '../index.js'

const { CANDIDE_FORWARDING_API_URL: apiUrl, CANDIDE_FORWARDING_POLICY_SECRET: policySecret, TEST_RECIPIENT: recipient } = process.env
if (!apiUrl || !policySecret || !recipient) {
  console.error('Set CANDIDE_FORWARDING_API_URL, CANDIDE_FORWARDING_POLICY_SECRET and TEST_RECIPIENT.')
  process.exit(1)
}

// Same salt as tests/integration/live.test.js so both suites share one address.
const TEST_SALT = '0x' + 'ca'.repeat(31) + '01'
const destinationChain = Number(process.env.TEST_DESTINATION_CHAIN ?? 42161)
const custodialWithdrawer = process.env.TEST_CUSTODIAL_WITHDRAWER || recipient
const chainName = (id) => Object.entries(CHAIN_IDS).find(([, v]) => v === id)?.[0] ?? String(id)

const sda = new CandideForwardingProtocol(undefined, { apiUrl, policySecret, custodialWithdrawer })

// Find every source chain that has a route to the destination. The API is keyed by source chain, so probe each
// known chain and keep the ones that answer with a matching route.
const candidates = [...new Set([destinationChain, ...Object.values(CHAIN_IDS)])]
const routesBySource = new Map()
for (const sourceChain of candidates) {
  const routes = await sda.getSupportedRoutes({ sourceChain, destinationChain }).catch(() => [])
  if (routes.length > 0) routesBySource.set(sourceChain, routes)
}
if (routesBySource.size === 0) {
  console.error(`No routes deliver to chain ${destinationChain}.`)
  process.exit(1)
}

const sourceChains = [...routesBySource.keys()]
const [deposit] = await sda.createDepositAddress({ sourceChains, destinationChain, destinationAddress: recipient, salt: TEST_SALT })

console.log(`\nForwarding address : ${deposit.address}`)
console.log(`Recipient          : ${deposit.destinationAddress}`)
console.log(`Custodial withdrawer: ${deposit.custodialWithdrawer}`)
console.log(`Destination chain  : ${destinationChain} (${chainName(destinationChain)})`)
console.log(`Active until       : ${new Date(deposit.expiry * 1000).toISOString()}`)
console.log(`Monitored on       : ${deposit.sourceChains.map((c) => `${c} (${chainName(c)})`).join(', ')}\n`)

for (const sourceChain of sourceChains) {
  console.log(`Deposit on ${sourceChain} (${chainName(sourceChain)})${sourceChain === destinationChain ? ' [same-chain, no bridge minimum]' : ''}:`)
  for (const route of routesBySource.get(sourceChain)) {
    for (const token of route.inputTokens) {
      let min = 'n/a'
      if (sourceChain !== destinationChain) {
        const [withLimits] = await sda.getSupportedRoutes({ sourceChain, destinationChain, sourceToken: token.token })
        if (withLimits?.limits?.min !== undefined) {
          min = `${Number(withLimits.limits.min) / 10 ** token.decimals} ${token.symbol}`
        }
      }
      console.log(`  ${token.symbol.padEnd(8)} ${token.token}  min ${min}`)
    }
  }
}

console.log('\nAfter sending, add the transaction(s) to .env as  TEST_DEPOSIT_TXS=<chainId>:<txHash>,<chainId>:<txHash>')
console.log('then run  npm run test:integration')
