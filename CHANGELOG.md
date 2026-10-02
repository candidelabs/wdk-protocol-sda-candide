# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0-beta.1] - Unreleased

Initial release: Candide's Forwarding Address as a WDK Smart Deposit Address protocol, implementing `ISdaProtocol`
from `@tetherto/wdk-wallet` (peer dependency, `^1.0.0-beta.19`).

### Added

- Route discovery, quotes, deposit address creation, lookup, renewal and recovery (reactivation), and transfer history
  through `getSupportedRoutes`, `quoteDeposit`, `createDepositAddress`, `getDepositAddress`, `renewDepositAddress`,
  `recoverDepositAddress`, `getTransfers`, `getTransfersByRecipient` and `getTransfer`.
- Client-side address derivation with `deriveDepositAddress`, and verification of every address returned by the API
  against the factory, beacon and proxy bytecode pinned in the SDK.
- Fee sponsorship reported on quotes (`sponsored`) when quoting for a deposit address.
- Optional recovery withdrawer (`recoveryWithdrawer`) that can recover stuck funds after a timelock.
- API errors mapped onto the WDK error classes; `CandideForwardingError` for address mismatches and deployment
  changes.
- Node.js and Bare entry points.
