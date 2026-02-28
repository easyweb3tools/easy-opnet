// Cross-contract method selectors computed via SHA256 (OPNet standard).
// OPNet uses SHA256, NOT keccak256 — hardcoded Ethereum selectors are WRONG.
// Always use encodeSelector() with the full function signature.

import { encodeSelector } from '@btc-vision/btc-runtime/runtime/math/abi';

// OP721 standard selectors
export const TRANSFER_FROM: u32 = encodeSelector('transferFrom(address,address,uint256)');
export const APPROVE: u32 = encodeSelector('approve(address,uint256)');
export const OWNER_OF: u32 = encodeSelector('ownerOf(uint256)');
export const BALANCE_OF: u32 = encodeSelector('balanceOf(address)');

// AgentVaultNFT custom selectors
export const IS_AGENT: u32 = encodeSelector('isAgent(address)');
export const MINT: u32 = encodeSelector('mint(address,string)');
export const REGISTER_AGENT: u32 = encodeSelector('registerAgent(address)');
export const REVOKE_AGENT: u32 = encodeSelector('revokeAgent(address)');
