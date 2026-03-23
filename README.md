# CipherGate - Decentralized Access Control on Solana

Encrypted key management and access policies enforced via Arcium MPC. Real end-to-end MPC computation.

Live Demo: https://cipher-gate.vercel.app
Program ID: 64DG39st7qGu8gGQtvQAkFAkgEFnzHa7GQiQRLUq1CyC (Solana Devnet)
Explorer: https://explorer.solana.com/address/64DG39st7qGu8gGQtvQAkFAkgEFnzHa7GQiQRLUq1CyC?cluster=devnet

## Real End-to-End MPC Flow

- getMXEPublicKey: Fetches MXE x25519 public key from Solana
- x25519.getSharedSecret: Derives shared secret with MPC cluster
- RescueCipher.encrypt: Encrypts requester ID, resource ID, allowed user, expiry, current time
- queue_computation: Submits encrypted data to Arcium MPC via Solana program
- awaitComputationFinalization: Waits for ARX nodes to process and callback

## Privacy Guarantees

- Policy secrecy: Access rules never visible to any party
- MPC enforcement: ARX nodes evaluate on secret shares only
- Conditional key release: Key fragments only when all conditions pass
- On-chain verification: BLS signature verified in callback

## Tech Stack

Solana - Arcium - Arcis - Anchor 0.32.1 - React + Vite - Arcium Client SDK

## License

MIT
