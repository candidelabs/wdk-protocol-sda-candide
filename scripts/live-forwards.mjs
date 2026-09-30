// Prints every forward delivered to TEST_RECIPIENT on TEST_DESTINATION_CHAIN (default Arbitrum), newest first.
//
//   npm run live:forwards
import CandideForwardingProtocol from '../index.js'

const { CANDIDE_FORWARDING_API_URL: apiUrl, TEST_RECIPIENT: recipient } = process.env
if (!apiUrl || !recipient) {
  console.error('Set CANDIDE_FORWARDING_API_URL and TEST_RECIPIENT.')
  process.exit(1)
}
const destinationChain = Number(process.env.TEST_DESTINATION_CHAIN ?? 42161)

const sda = new CandideForwardingProtocol(undefined, { apiUrl })
const transfers = await sda.getTransfersByRecipient(destinationChain, recipient, { limit: Number(process.env.LIMIT ?? 20) })

console.log(`${transfers.length} forward(s) to ${recipient} on chain ${destinationChain}\n`)
for (const t of transfers) {
  console.log(`${t.id}  ${t.status.padEnd(10)} ${String(t.route).padEnd(10)} ${t.sourceChainId} -> ${t.destinationChainId}`)
  console.log(`   source tx ${t.sourceTxHash}`)
  if (t.destinationTxHash) console.log(`   dest tx   ${t.destinationTxHash}`)
  if (t.proxyAddress) console.log(`   proxy     ${t.proxyAddress}`)
  if (t.sourceAddresses) console.log(`   from      ${JSON.stringify(t.sourceAddresses)}`)
  if (t.failureReason) console.log(`   failure   ${t.failureReason}`)
}
