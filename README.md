# ImmutableShipTrack

## Overview

ImmutableShipTrack is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It provides an immutable ledger for recording product conditions before and after shipment, addressing real-world problems in supply chain management, e-commerce, and logistics. By leveraging blockchain's immutability, the project ensures tamper-proof records that can be used for dispute resolution, insurance claims, quality assurance, and provenance verification.

### Problems Solved
- **Disputes in Shipping**: Buyers and sellers often argue over product damage during transit. Immutable records provide verifiable proof of conditions at key points.
- **Counterfeit and Fraud Prevention**: Tracks authentic product states to prevent substitution or tampering.
- **Insurance and Claims**: Enables automated, evidence-based claims for damaged goods, reducing fraud and processing time.
- **Supply Chain Transparency**: Helps businesses and consumers verify product integrity, especially in industries like pharmaceuticals, electronics, and perishables.
- **Regulatory Compliance**: Assists in meeting standards for traceability (e.g., in food safety or luxury goods).

The system uses oracles (integrated via smart contracts) to input real-world data like sensor readings (e.g., temperature, humidity) or inspections, ensuring records are tied to physical events.

## Architecture

The project consists of 6 core Clarity smart contracts, designed for modularity, security, and efficiency. Each contract handles a specific aspect of the workflow, with clear interfaces for interaction. Contracts are ownable where necessary, use STX for fees, and incorporate error handling with Clarity's built-in traits.

### Smart Contracts

1. **ProductRegistry.clar**  
   - Purpose: Registers unique products as NFTs (using SIP-009 trait) for tracking. Each product gets a unique ID linked to metadata like description, manufacturer, and initial condition hash.  
   - Key Functions:  
     - `register-product (product-id: uint, metadata: (string-ascii 256), owner: principal)`: Mints an NFT for the product.  
     - `get-product-details (product-id: uint)`: Retrieves metadata (read-only).  
   - Traits/Dependencies: Implements SIP-009 for NFT standards. Interacts with AccessControl for role-based minting.

2. **ConditionRecorder.clar**  
   - Purpose: Records immutable condition hashes (e.g., from photos, sensors) at pre- and post-shipment stages. Uses timestamps and hashes for verifiability.  
   - Key Functions:  
     - `record-pre-shipment (product-id: uint, condition-hash: (buff 32), timestamp: uint)`: Logs pre-shipment state (only callable by authorized shippers).  
     - `record-post-shipment (product-id: uint, condition-hash: (buff 32), timestamp: uint)`: Logs post-shipment state.  
     - `get-condition-history (product-id: uint)`: Returns list of recorded conditions (read-only).  
   - Traits/Dependencies: Uses OracleIntegrator for timestamp validation; links to ProductRegistry for ID verification.

3. **ShipmentTracker.clar**  
   - Purpose: Manages shipment lifecycle, tracking status changes (e.g., initiated, in-transit, delivered) and linking to condition records.  
   - Key Functions:  
     - `initiate-shipment (product-id: uint, shipper: principal, receiver: principal)`: Starts a shipment, requires pre-shipment record.  
     - `update-status (product-id: uint, status: (string-ascii 32))`: Updates status (e.g., "delivered"), triggers post-shipment recording.  
     - `get-shipment-status (product-id: uint)`: Retrieves current status and history.  
   - Traits/Dependencies: Integrates with ConditionRecorder to enforce recording at status changes; uses AccessControl for updates.

4. **OracleIntegrator.clar**  
   - Purpose: Integrates external data feeds (e.g., via trusted oracles) for real-world inputs like GPS, sensors, or timestamps, ensuring on-chain data accuracy.  
   - Key Functions:  
     - `submit-oracle-data (request-id: uint, data: (buff 128), oracle: principal)`: Submits verified data (e.g., condition metrics).  
     - `verify-oracle (request-id: uint)`: Checks data against registered oracles.  
     - `register-oracle (oracle: principal)`: Adds trusted oracles (admin only).  
   - Traits/Dependencies: Ownable trait for admin functions; called by ConditionRecorder and ShipmentTracker.

5. **DisputeResolver.clar**  
   - Purpose: Handles disputes by comparing pre- and post-shipment records, with escrow for stakes. Automates resolutions based on condition diffs.  
   - Key Functions:  
     - `raise-dispute (product-id: uint, claimant: principal, stake: uint)`: Starts dispute with STX escrow.  
     - `resolve-dispute (dispute-id: uint, evidence-hash: (buff 32))`: Admin or oracle resolves, releases funds.  
     - `get-dispute-status (dispute-id: uint)`: Views details.  
   - Traits/Dependencies: Interacts with ConditionRecorder for evidence; uses TokenEscrow for staking.

6. **AccessControl.clar**  
   - Purpose: Manages roles (e.g., admin, shipper, receiver, oracle) to enforce permissions across contracts.  
   - Key Functions:  
     - `grant-role (role: (string-ascii 32), user: principal)`: Assigns roles.  
     - `has-role (role: (string-ascii 32), user: principal)`: Checks permissions (read-only).  
     - `revoke-role (role: (string-ascii 32), user: principal)`: Removes roles.  
   - Traits/Dependencies: Used as a trait by all other contracts for authorization.

### Contract Interactions
- Products are registered in `ProductRegistry`.
- Conditions are recorded via `ConditionRecorder`, validated by `OracleIntegrator`.
- Shipments are tracked in `ShipmentTracker`, which enforces condition logs.
- Disputes use `DisputeResolver` with access checks from `AccessControl`.
- All contracts are deployed on Stacks testnet/mainnet, with cross-contract calls for modularity.

## Prerequisites
- Stacks Wallet (e.g., Hiro Wallet) for STX and interactions.
- Clarity development tools: Install via `cargo install clarity-repl` or use Stacks CLI.
- Node.js for any frontend (optional, not included here).

## Installation
1. Clone the repository:  
   ```
   git clone `git clone <repo-url>`
   cd ImmutableShipTrack
   ```

2. Install dependencies (if using a frontend):  
   ```
   npm install
   ```

3. Deploy contracts using Clarinet (Stacks dev tool):  
   ```
   clarinet integrate
   ```
   - Deploy each .clar file in order: AccessControl → ProductRegistry → OracleIntegrator → ConditionRecorder → ShipmentTracker → DisputeResolver.

4. Test contracts:  
   ```
   clarinet test
   ```

## Usage
1. **Register a Product**: Call `register-product` on ProductRegistry with metadata.
2. **Record Conditions**: Use ConditionRecorder for pre/post hashes (e.g., SHA-256 of inspection data).
3. **Track Shipment**: Initiate and update via ShipmentTracker.
4. **Integrate Oracle**: Submit real-world data (e.g., from IoT devices) to OracleIntegrator.
5. **Resolve Disputes**: Raise and resolve using DisputeResolver, providing evidence.
6. **Query Data**: Use read-only functions for transparency.

### Example Workflow (via Clarity REPL or dApp)
- Manufacturer registers product.
- Shipper records pre-shipment condition.
- During transit, oracle submits updates.
- Receiver records post-shipment.
- If dispute, escrow STX and resolve with on-chain evidence.

## Security Considerations
- All contracts use Clarity's type safety and error codes (e.g., err u100 for unauthorized).
- No private keys on-chain; use principals for access.
- Audited for reentrancy (Clarity's linear execution helps).
- Fees in STX to prevent spam.

## Contributing
Fork the repo, create a branch, and submit a PR. Follow Clarity best practices.

## License
MIT License. See LICENSE file for details.