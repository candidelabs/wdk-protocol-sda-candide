# @candidelabs/wdk-protocol-sda-candide

[<img src="https://raw.githubusercontent.com/candidelabs/wdk-protocol-sda-candide/main/assets/built-with-wdk.png" alt="Built with WDK" height="32">](https://docs.wdk.tether.io)

[Candide's Forwarding Address](https://docs.candide.dev/forwarding-address/overview/) as a
[WDK](https://docs.wdk.tether.io) Smart Deposit Address protocol. A forwarding address is one deterministic address
that accepts deposits on every supported EVM chain, including the destination chain itself, and forwards each token as
its own equivalent to a recipient on a destination chain. The address is a self-custodial contract: the recipient can
always withdraw from it, and an optional company-controlled recovery withdrawer can recover stuck funds after a
timelock.

```bash
npm install @candidelabs/wdk-protocol-sda-candide
```

Implements the `ISdaProtocol` interface from [`@tetherto/wdk-wallet`](https://github.com/tetherto/wdk-wallet)
(`SdaProtocol`), supported range `^1.0.0-beta.19`. Node.js 20 or later. A [Bare](https://bare.pears.com) entry point is
exported as well and smoke-tested on Bare 1.34 (`npm run test:bare`: load, derivation, routes, quote).

Building with an AI coding agent? Install the [Candide skills](https://github.com/candidelabs/skills) so it knows the
forwarding flow and this SDK:

```
# Claude Code
/plugin marketplace add candidelabs/skills
/plugin install candide@candide

# Codex CLI
npx -y github:candidelabs/skills
```

## Quick start

```javascript
import CandideForwardingProtocol from '@candidelabs/wdk-protocol-sda-candide'

// Pass a WDK wallet account as the first argument to make its address the default recipient, or `undefined`.
const sda = new CandideForwardingProtocol(undefined, {
  apiUrl: process.env.CANDIDE_FORWARDING_API_URL,             // API URL as shown in the Candide dashboard
  policySecret: process.env.CANDIDE_FORWARDING_POLICY_SECRET, // optional: only needed to activate; server-side only
  recoveryWithdrawer: '0xYourCompanyRecoveryWallet'          // optional, recommended; defaults to the recipient
})

// Create (activate) one address that accepts deposits on Ethereum, Arbitrum and Base and delivers on Arbitrum.
// `destinationAddress` is required unless a wallet account is bound.
const [deposit] = await sda.createDepositAddress({
  sourceChains: [1, 42161, 8453],
  destinationChain: 42161,
  destinationAddress: '0xRecipientOnArbitrum'
})
console.log('Send funds to', deposit.address, 'active until', new Date(deposit.expiry * 1000))

// Poll for deliveries.
const transfers = await sda.getTransfers(deposit.address)
for (const t of transfers) console.log(t.id, t.status, t.sourceChainId, t.destinationTxHash)

// Monitoring is deliberately short-lived. Show `expiry` next to the address, and renew each time the
// deposit screen is opened; renewal is idempotent and returns the fresh expiry.
const refreshed = await sda.renewDepositAddress(deposit.id)
console.log('Deposits accepted until', new Date(refreshed.expiry * 1000))
```

## Things to know

- **Routes are per source chain**: `getSupportedRoutes` requires `sourceChain`. Only tokens listed for a route are
  forwarded; never hardcode chains or tokens.
- **One address covers every source chain**, and the destination chain is always included. Its `id` is the address
  itself.
- **Monitoring is intentionally short-lived** (`expiry`, unix seconds). Monitoring an address costs money and
  is what detects deposits, so show the expiry in the UI and call `renewDepositAddress` whenever you display the
  address. A deposit that lands after expiry stays safe at the address and is forwarded once it is renewed.
- **Follow deposits with `getTransfers(address)`.** A transfer's `sourceTxHash` is the forwarding transaction on the
  source chain; the depositors are in `sourceAddresses`.
- **Amounts are `bigint`s in base units; chains are numeric ids** (names like `'arbitrum'` are accepted as input).
- **Only activation needs `policySecret`.** Everything else is public.

## Configuration

```javascript
new CandideForwardingProtocol(account?, config)
```

`account` is an `IWalletAccount` or `IWalletAccountReadOnly`; its address is the default recipient.

`apiUrl` is the only required option.

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `apiUrl` | `string` | yes | | The Forwarding Address API URL exactly as shown in the [Candide dashboard](https://dashboard.candide.dev). It carries the team API key; the SDK never parses it. |
| `policySecret` | `string` | only to activate | none | The forwarding policy secret from the dashboard, sent as `Authorization: Bearer`. Needed by `createDepositAddress`, `renewDepositAddress` and `recoverDepositAddress`; every other method works without it. Keep it server-side. |
| `recoveryWithdrawer` | `string` | no | recipient | Company wallet allowed to withdraw stuck funds after a timelock. Can also be given per call to `createDepositAddress` and `deriveDepositAddress`. See below. |
| `verifyAddresses` | `boolean` | no | `true` | Derive every created address client-side and compare it with the API's answer. |
| `deployParams` | `Partial<CandideDeployParams>` | no | pinned | Overrides for `factory`, `singleton`, `proxyCreationCode`, `allowedRelayer`. Pinning `allowedRelayer` makes derivation fully offline. |
| `deployParamsTtlMs` | `number` | no | `600000` | Cache lifetime of the relayer address fetched from the API. |
| `routesCacheTtlMs` | `number` | no | `600000` | Cache lifetime of `forwarding_getRoutes` results, per source chain. |

### Client and backend instances

Only activation needs the policy secret, so a wallet client can use the SDK without it and leave activation to a
backend that holds it:

```javascript
// Client: routes, quotes, minimums, derivation, lookups and transfer history. No secret.
const client = new CandideForwardingProtocol(account, { apiUrl })

// Backend: the same, plus createDepositAddress / renewDepositAddress / recoverDepositAddress.
const backend = new CandideForwardingProtocol(undefined, { apiUrl, policySecret, recoveryWithdrawer })
```

### Recovery withdrawer

The API and the contracts call this parameter `custodialWithdrawer`; the SDK maps the name for you.

Two parties can take funds out of a forwarding address on the source chain: the recipient immediately, and the
recovery withdrawer after a timelock (the recipient can veto). A user who funded the address from an exchange has no
key on the source chain and cannot withdraw. Set `recoveryWithdrawer` to a secure company wallet to recover stuck
funds on their behalf. Leaving it unset makes the address fully self-custodial (withdrawer = recipient). Both values
are derivation inputs: changing either produces a different address. Stuck funds can also be recovered through the
[recovery frontend](https://forwarding-address.candidelabs.com/).

## API

`CandideForwardingProtocol` extends WDK's `SdaProtocol`. Types below are the WDK SDA types plus the Candide
extensions listed in [Types](#types).

### `getSupportedRoutes(options): Promise<SdaRoute[]>`

```typescript
options: { sourceChain: Blockchain, destinationChain?: Blockchain, sourceToken?: string }
```

One route per (source chain, destination chain) pair, each with the accepted `inputTokens` (`token` is the
source-chain contract address). With `sourceToken`, the route also carries `limits.min`, the smallest bridge minimum
for that token. Throws `ValueError` without `sourceChain`. The `outputAsset` filter is not applied yet: filter
`inputTokens` by `destinationTokenAddress` yourself.

### `quoteDeposit(options): Promise<CandideDepositQuote>`

```typescript
options: { sourceChain: Blockchain, inputToken: string, destinationChain: Blockchain, inputAmount: bigint, depositAddress?: string }
```

Non-binding estimate. `outputAsset` is the destination token address, `outputAmount` its base-unit amount. `fees`
holds the Candide relayer fee (`type: 'protocol'`) and the bridge fee (`type: 'network'`), in the input token; their
`included` flag is `true` when deducted from `outputAmount`. With `depositAddress`, the quote reflects that address's
policy: when the policy sponsors fees, `sponsored` is `true`, `outputAmount` equals the input and fees are
`included: false`. Extra fields: `bridge`, `outputAssetSymbol`, `sponsored`.

### `createDepositAddress(options): Promise<CandideDepositAddress[]>`

```typescript
options: { sourceChains: Blockchain[], destinationChain: Blockchain, destinationAddress?: string, recoveryWithdrawer?: string, salt?: string }
```

Activates monitoring on `sourceChains` plus the destination chain and returns a one-element array whose
`sourceChains` and `supportedInputTokens` cover all of them. Store `address`; `id` is the same value and exists to
satisfy the interface, so any id-taking method also accepts the address. `salt` is a 32-byte hex value for issuing
several addresses to one recipient; default zero. The descriptor includes `expiry`, `supportedInputTokens` across the
source chains, and the `recoveryWithdrawer` and `salt` used.

### `deriveDepositAddress(options): Promise<string>`

Same options as `createDepositAddress`. Computes the CREATE2 address client-side without activating it. The only
network call is fetching the relayer address (cached); none with `deployParams.allowedRelayer` configured.

### `getDepositAddress(id): Promise<CandideDepositAddress>`

Descriptor of an activated address. `sourceChains` are every chain the address has been activated on; `expiry` is
the soonest per-chain expiry, so a past value means at least one chain needs renewing. Throws `NoSuchElementError`
for an unknown address.

### `renewDepositAddress(id): Promise<CandideDepositAddress>`

Re-activates the address on every recorded source chain (active or expired) with the stored derivation inputs and
returns the refreshed descriptor.

### `getTransfers(address, options?): Promise<CandideTransfer[]>`

```typescript
options: { status?: SdaTransferStatus, skip?: number, limit?: number }
```

Forwards that went through the address, newest first. Throws `NoSuchElementError` for an unknown address.

### `getTransfersByRecipient(destinationChain, recipient, options?): Promise<CandideTransfer[]>`

Every forward delivered to the recipient on that chain, across all of its forwarding addresses. Same options.

### `getTransfer(id): Promise<CandideTransfer>`

One forward by its id. Throws `NoSuchElementError` if unknown.

### `recoverDepositAddress(options): Promise<SdaRecoveryResult>`

```typescript
options: { id: string } | { address: string }
```

Re-activates a lapsed address so any balance waiting at it is picked up by the next monitoring sweep. It is a
reindex: no on-chain transaction is sent and no funds are moved by this call. Returns
`{ status: 'reindexed', address, id, message }`, or `{ status: 'failed', address, message }` for an unknown address.
On-chain self-service recovery (withdrawing from the address) is done through the
[recovery frontend](https://forwarding-address.candidelabs.com/).

### `disableDepositAddress(id)`

Not supported: activations expire on their own. Throws `UnsupportedOperationError`.

### `getDeployParams(): Promise<CandideDeployParams>`

Candide-specific. The derivation inputs in use: pinned `factory`, `singleton` (the beacon) and `proxyCreationCode`,
plus the `allowedRelayer` reported by the API.

### Transfer status

| Candide forward | `SdaTransferStatus` |
|---|---|
| `delivered` | `completed` |
| `pending`, `unknown` | `processing` |
| `failed` with `failureReason: 'refunded'` | `refunded` |
| `failed` with `failureReason: 'expired'` | `expired` |
| `failed` (other) | `failed` |
| any other value | `pending` |

The original value is kept in `providerStatus`.

### Errors

API errors are mapped onto the WDK error classes; the JSON-RPC `code` and `message` are kept in `error.cause`.

| Situation | Thrown | What to do |
|---|---|---|
| `quoteDeposit` input token is not a valid ERC-20 address | `InvalidTokenError` | Use a `token` from `getSupportedRoutes` |
| Invalid arguments; amount below the bridge minimum or above its maximum | `ValueError` | Fix the input; use `limits.min` from `getSupportedRoutes` |
| Route not supported | `SdaError`, `reason: 'ROUTE_NOT_SUPPORTED'` | Pick a route from `getSupportedRoutes` |
| Unknown address or transfer | `NoSuchElementError` | The address was never activated, or the id is wrong |
| Missing or wrong policy secret | `ValueError` (missing) / `ProviderError`, `reason: 'UNAUTHORIZED'` | Configure `policySecret` |
| Policy disabled, address cap reached | `ProviderError`, `reason: 'FORBIDDEN'` | Check the policy in the dashboard |
| Quote unavailable, internal error, transport failure | `ProviderError`, `reason: 'INTERNAL_SERVER_ERROR'` or `'NETWORK_ERROR'` | Retry later |
| Server address differs from the client-side derivation | `CandideForwardingError`, `reason: 'ADDRESS_MISMATCH'` | Do not fund either address; investigate |
| Server reports a different factory, beacon or bytecode | `CandideForwardingError`, `reason: 'DEPLOYMENT_CHANGED'` | Upgrade the SDK, or pass verified `deployParams` |
| Method not supported by Candide | `UnsupportedOperationError` | Only `disableDepositAddress` |

For integration help, reach the Candide team through [candide.dev/contact](https://www.candide.dev/contact). Report
bugs in this SDK as [GitHub issues](https://github.com/candidelabs/wdk-protocol-sda-candide/issues), and security
vulnerabilities privately to [team@candidelabs.com](mailto:team@candidelabs.com) (see [SECURITY.md](SECURITY.md)).

### Types

Exported from the package and generated into `types/`. Each extends the corresponding WDK type by adding fields.

```typescript
CandideForwardingProtocolConfig    // the configuration table above
CandideCreateDepositAddressOptions // SdaCreateDepositAddressOptions & { recoveryWithdrawer?, salt? }
CandideDepositOptions              // SdaDepositOptions & { depositAddress? }
CandideDepositAddress              // SdaDepositAddress & { recoveryWithdrawer, salt, supportedInputTokens: CandideSdaToken[] }
CandideSdaToken                    // SdaToken & { destinationTokenAddress, feeBps }
CandideDepositQuote                // SdaDepositQuote & { bridge, outputAssetSymbol, sponsored }
CandideTransfer                    // SdaTransfer & { providerStatus, route?, recipient, sourceChainId, sourceTxHash,
                                   //   sourceAddresses?, destinationChainId?, destinationTxHash?, proxyAddress?,
                                   //   sourceBlockTimestamp?, failureReason?, refundTxHash? }
CandideDeployParams                // { factory, singleton, proxyCreationCode, allowedRelayer, version? }
CandideForwardingError             // WdkError & { reason: 'ADDRESS_MISMATCH' | 'DEPLOYMENT_CHANGED' }
```

`sourceAddresses` is `[{ address, amount }]`, largest first; `address` can be the literal `"redacted"` for dust
entries. It is `null` when attribution was not possible and absent for forwards that predate it.

## Derivation, verification and upgrades

A forwarding address is
`CREATE2(factory, salt, proxyCreationCode ++ (beacon, initialize(recipient, allowedRelayer, recoveryWithdrawer, destinationChainId)))`.

- **Chosen by you**: recipient, recovery withdrawer, destination chain, salt. These are the security model: the
  relayer can only forward funds to the recipient, it cannot withdraw.
- **Pinned in this SDK** (`PINNED_DEPLOY_PARAMS`): factory, beacon and proxy bytecode. They decide which code runs at
  the address, so the SDK keeps its own copy instead of trusting the API. Candide upgrades the contract implementation
  through the beacon, which does not change addresses. A redeploy of the factory or beacon does, and needs a new SDK
  release or `deployParams` overrides; until then the SDK throws `DEPLOYMENT_CHANGED`.
- **Fetched from the API**: the relayer address, cached for `deployParamsTtlMs`. A stale value only makes derivation
  disagree with the API, which verification catches.

With `verifyAddresses` on, `createDepositAddress` and `renewDepositAddress` refuse to return an address the API and
the SDK disagree on. `computeProxyAddress` and `ZERO_SALT` are exported for callers who want to derive themselves.

## Development

```bash
npm install
npm test                 # unit tests, no network
npm run lint
npm run build:types      # regenerate types/ from JSDoc
npm run test:bare        # Bare runtime smoke test; also hits the live API when CANDIDE_FORWARDING_API_URL is set
```

Live tests read `.env` (see `.env.example`): `CANDIDE_FORWARDING_API_URL`, `CANDIDE_FORWARDING_POLICY_SECRET`,
`TEST_RECIPIENT`, optional `TEST_RECOVERY_WITHDRAWER`.

```bash
npm run test:integration # routes, quote, derive, activate, lookup, renew, recover, transfers
npm run live:address     # activates the test address on every chain routing to TEST_DESTINATION_CHAIN and prints
                         # the tokens and minimums to deposit
npm run live:forwards    # lists the recipient's forwards
```

After sending deposits to the test address, set `TEST_DEPOSIT_TXS=<chainId>:<txHash>,...` and run
`npm run test:integration` again: it polls each deposit until delivered and checks every transfer lookup. The suites
reuse one address (fixed salt) so repeated runs refresh rather than create.

The unit tests in `tests/` show the exact request bodies sent and responses expected for every method.

## License

Apache-2.0
