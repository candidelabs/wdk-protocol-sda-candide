# @candidelabs/wdk-protocol-sda-candide

[![npm version](https://img.shields.io/npm/v/@candidelabs/wdk-protocol-sda-candide.svg)](https://www.npmjs.com/package/@candidelabs/wdk-protocol-sda-candide)
[![license](https://img.shields.io/npm/l/@candidelabs/wdk-protocol-sda-candide.svg)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-docs.candide.dev-blue)](https://docs.candide.dev/forwarding-address/overview/)

> This package is in beta. The API may change between releases.

A [WDK](https://docs.wdk.tether.io) Smart Deposit Address (SDA) protocol module for
[Candide's Forwarding Address](https://docs.candide.dev/forwarding-address/overview/).

A forwarding address is one deterministic address that accepts deposits on every supported EVM chain, including the
destination chain itself, and forwards each token as its own equivalent to a recipient on a destination chain. The
address is a self-custodial CREATE2 contract: the recipient can always withdraw from it, and a company-controlled
custodial withdrawer can recover stuck funds after a timelock.

## About WDK

The Wallet Development Kit (WDK) by Tether is a modular framework for building multi-chain, non-custodial wallets.
Protocol modules like this one plug third-party services into any WDK wallet account through a common interface.
See [docs.wdk.tether.io](https://docs.wdk.tether.io) for the framework and the SDA interface.

## Installation

```bash
npm install @candidelabs/wdk-protocol-sda-candide
```

Requires Node.js 20 or later (global `fetch`). A [Bare](https://bare.pears.com) entry point is exported as well.

## Quick start

```javascript
import CandideForwardingProtocol from '@candidelabs/wdk-protocol-sda-candide'

// `account` is any WDK wallet account (its address is the default recipient) or `undefined`.
const sda = new CandideForwardingProtocol(account, {
  apiUrl: process.env.CANDIDE_FORWARDING_API_URL,             // API URL as shown in the dashboard (carries your team API key)
  policySecret: process.env.CANDIDE_FORWARDING_POLICY_SECRET, // forwarding policy secret (dashboard); activation only
  custodialWithdrawer: '0x...'                                // your company's recovery wallet (recommended)
})

// 1. Discover what can be deposited from Ethereum, and where it is delivered.
const routes = await sda.getSupportedRoutes({ sourceChain: 'ethereum' })

// 2. Optionally quote a deposit (non-binding).
const quote = await sda.quoteDeposit({
  sourceChain: 1,
  inputToken: routes[0].inputTokens[0].token,
  destinationChain: routes[0].destinationChain,
  inputAmount: 100_000_000n // 100 USDT
})

// 3. Create (activate) the forwarding address. One address covers every source chain.
const [deposit] = await sda.createDepositAddress({
  sourceChains: [1, 42161, 8453],
  destinationChain: 42161
})
console.log('Send funds to:', deposit.address, 'active until', new Date(deposit.expiry * 1000))

// 4. Track deliveries.
const transfers = await sda.getTransfers(deposit.address)
```

## Configuration

```javascript
new CandideForwardingProtocol(account?, config)
```

| Option | Required | Default | Description |
|---|---|---|---|
| `apiUrl` | yes | | The Forwarding Address API URL exactly as shown in the [Candide dashboard](https://dashboard.candide.dev). It carries your team API key. |
| `policySecret` | for activation | | The forwarding policy secret from the dashboard. Required by `createDepositAddress`, `renewDepositAddress` and `recoverDepositAddress`; every other method is public. Keep it server-side. |
| `custodialWithdrawer` | no | recipient | Company wallet allowed to withdraw stuck funds after a timelock. See below. |
| `verifyAddresses` | no | `true` | Derive every created address client-side and compare it with the API's answer. |
| `deployParams` | no | pinned | Overrides for the derivation inputs (`factory`, `singleton`, `proxyCreationCode`, `allowedRelayer`). |
| `deployParamsTtlMs` | no | 10 min | Cache lifetime of the relayer address fetched from the API. |
| `routesCacheTtlMs` | no | 10 min | Cache lifetime of `forwarding_getRoutes` results, per source chain. |

### Credentials and fee sponsorship

Two values come from the dashboard. The **API URL** (`apiUrl`) carries your team API key and identifies your team; copy
it as shown. The **policy secret** (`policySecret`) is required to activate and monitor addresses and must stay on your
server; every address activated with it belongs to that forwarding policy.

Fee sponsorship is a toggle on the policy in the dashboard and needs no change in your integration. When it is on,
forwards deliver the full deposit to the recipient and the fees are billed to the policy; when it is off, the fees are
deducted from the deposit. To see which applies before funds move, quote with the forwarding address:

```javascript
const quote = await sda.quoteDeposit({ ...options, depositAddress: deposit.address })
quote.sponsored              // true when the policy pays the fees
quote.fees[0].included       // false when sponsored: the fee is not deducted from outputAmount
```

### Choosing the custodial withdrawer

Every forwarding address has two parties that can take funds out of it on the source chain:

- the **recipient** can withdraw immediately;
- the **custodial withdrawer** can withdraw after a timelock, and the recipient can veto.

If a user funds the address from an exchange, they have no key on the source chain and cannot withdraw themselves.
Set `custodialWithdrawer` to a secure company wallet so you can recover stuck funds on their behalf. Leaving it unset
makes the address fully self-custodial (withdrawer = recipient) and accepts that risk. Both values are part of the
address derivation, so changing either produces a different address.

Stuck funds can also be recovered manually through the
[recovery frontend](https://forwarding-address.candidelabs.com/).

## API

`CandideForwardingProtocol` extends WDK's `SdaProtocol`. Chains are accepted as numeric ids, numeric strings or
names (`'ethereum'`, `'arbitrum'`, ...) and are always returned as numeric ids. Amounts are `bigint`s in the token's
base unit.

| Method | Backed by | Notes |
|---|---|---|
| `getSupportedRoutes({ sourceChain, destinationChain?, sourceToken? })` | `forwarding_getRoutes`, `forwarding_getMinimumAmount` | `sourceChain` is required. One route per (source, destination) pair; `outputAsset` is unset because each token is delivered as its own equivalent. With `sourceToken`, `limits.min` is the smallest bridge minimum. |
| `quoteDeposit({ sourceChain, inputToken, destinationChain, inputAmount, depositAddress? })` | `forwarding_estimateOutput` | Fees are itemised as the Candide relayer fee (`protocol`) and the bridge fee (`network`); `included` says whether they are deducted from `outputAmount`. With `depositAddress`, the quote reflects that address's policy sponsorship. Extra: `bridge`, `outputAssetSymbol`, `sponsored`. |
| `createDepositAddress({ sourceChains, destinationChain, destinationAddress?, custodialWithdrawer?, salt? })` | `account_activateForwardingAddress` | Returns a one-element array. `id` is the address. The destination chain is always monitored too. |
| `deriveDepositAddress(sameOptions)` | `forwarding_getDeployParams` (cached) | Client-side CREATE2, no activation. Fully offline when `deployParams.allowedRelayer` is configured. |
| `getDepositAddress(id)` | `forwarding_getDeployParamsByAddress`, `forwarding_getActivation` | `expiry` is the soonest per-chain expiry. |
| `renewDepositAddress(id)` | same + `account_activateForwardingAddress` | Refreshes the activation on the recorded source chains. |
| `getTransfers(address, { status?, skip?, limit? })` | `forwarding_getForwardsByRecipient` | Forwards that went through this address, newest first. |
| `getTransfersByRecipient(destinationChain, recipient, options?)` | `forwarding_getForwardsByRecipient` | All forwards delivered to a recipient. |
| `getTransfer(id)` | `forwarding_getForwardById` | |
| `recoverDepositAddress({ id } \| { address })` | `renewDepositAddress` | Re-activates a lapsed address; waiting balances are forwarded on the next sweep. |
| `disableDepositAddress(id)` | | Unsupported: activations simply expire. |
| `getDeployParams()` | `forwarding_getDeployParams` | Candide-specific. The derivation inputs in use. |

Transfers carry the SDA `id` and `status` plus the Candide forward fields (`route`, `sourceChainId`, `sourceTxHash`,
`sourceAddresses`, `destinationTxHash`, `proxyAddress`, `failureReason`, ...). `sourceTxHash` is the forwarding
transaction on the source chain, `destinationTxHash` the delivery on the destination chain, and `sourceAddresses`
(`[{ address, amount }]`, `address` may be `"redacted"` for dust) the addresses that funded the forward. To follow a
deposit, list `getTransfers(address)` or `getTransfersByRecipient(...)`. Status mapping:

| Candide | SDA |
|---|---|
| `delivered` | `completed` |
| `pending`, `unknown` | `processing` |
| `failed` + `refunded` | `refunded` |
| `failed` + `expired` | `expired` |
| `failed` (other) | `failed` |

### Errors

API errors are mapped onto the WDK error classes; the original JSON-RPC code and message are kept in `error.cause`.

| API error | Thrown |
|---|---|
| invalid params, amount too small / too large | `ValueError` |
| route not found | `SdaError` (`ROUTE_NOT_SUPPORTED`) |
| address not found | `NoSuchElementError` |
| unauthorized | `ProviderError` (`UNAUTHORIZED`) |
| account disabled, address cap reached | `ProviderError` (`FORBIDDEN`) |
| quote unavailable, internal error, transport failure | `ProviderError` (`INTERNAL_SERVER_ERROR` / `NETWORK_ERROR`) |

Two Candide-specific errors are exported as `CandideForwardingError` with a `reason`:

- `ADDRESS_MISMATCH`: the API returned an address that the client-side derivation does not reproduce. The API has
  activated its address; do not fund either until the discrepancy is understood.
- `DEPLOYMENT_CHANGED`: the API reports a factory, beacon or proxy bytecode different from the ones pinned in this
  SDK release. Upgrade the SDK, or pass verified values in `deployParams`.

## Derivation inputs, verification and upgrades

A forwarding address is `CREATE2(factory, salt, proxyCreationCode ++ (beacon, initialize(recipient, relayer,
custodialWithdrawer, destinationChainId)))`. The inputs fall into three groups:

- **Chosen by you**: recipient, custodial withdrawer, destination chain, salt. These are the security model: the
  relayer can only forward funds to the recipient, it cannot withdraw.
- **Pinned in this SDK**: factory, beacon and proxy bytecode. They decide which code runs at the address, so the SDK
  keeps its own copy (`PINNED_DEPLOY_PARAMS`) instead of trusting the API for them. Candide upgrades the contract
  implementation through the beacon, which does not change any address. A redeploy of the factory or beacon does,
  and needs a new SDK release (or `deployParams` overrides).
- **Fetched from the API**: the relayer address, cached for `deployParamsTtlMs`. It can rotate; a stale value only
  makes derivation disagree with the API, which verification catches.

With `verifyAddresses` on (the default), every `createDepositAddress` and `renewDepositAddress` derives the address
locally and refuses to return an address the API and the SDK disagree on.

## Development

```bash
npm install
npm test                 # unit tests, no network
npm run lint
npm run build:types      # regenerate types/ from JSDoc

# live tests against the Candide API; reads .env when present
CANDIDE_FORWARDING_API_URL=... CANDIDE_FORWARDING_POLICY_SECRET=... TEST_RECIPIENT=0x... npm run test:integration
```

The integration suite activates one forwarding address for `TEST_RECIPIENT` with a fixed salt, so repeated runs
refresh the same address. Set `TEST_CUSTODIAL_WITHDRAWER` to use a different withdrawer.

To test real deposits end to end, `npm run live:address` activates the test address on every chain that routes to
`TEST_DESTINATION_CHAIN` (default Arbitrum) and prints the tokens and minimums. Send a deposit, then add
`TEST_DEPOSIT_TXS=<chainId>:<txHash>,...` to `.env`; `npm run test:integration` polls each transaction until it is
delivered and checks the transfer lookups.

## License

Apache-2.0
