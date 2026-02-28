// Revert error message constants for all contracts

// Agent registry errors
export const ERR_NOT_AGENT: string = 'Caller is not a registered agent';
export const ERR_NOT_DEPLOYER: string = 'Caller is not the contract deployer';
export const ERR_AGENT_ALREADY_REGISTERED: string = 'Agent is already registered';
export const ERR_AGENT_NOT_FOUND: string = 'Agent not found in registry';

// Marketplace errors
export const ERR_LISTING_NOT_ACTIVE: string = 'Listing is not active';
export const ERR_PRICE_ZERO: string = 'Price must be greater than zero';
export const ERR_BID_TOO_LOW: string = 'Bid must exceed current highest bid';
export const ERR_NOT_SELLER: string = 'Only the seller can perform this action';
export const ERR_HAS_BIDS: string = 'Cannot cancel listing with active bids';
export const ERR_NOT_EXPIRED: string = 'Auction has not expired yet';
export const ERR_IS_AUCTION: string = 'Cannot buy now on auction listings';
export const ERR_SELF_BID: string = 'Seller cannot bid on own listing';
export const ERR_LISTING_EXPIRED: string = 'Listing has expired';
export const ERR_FEE_TOO_HIGH: string = 'Fee basis points exceed maximum (1000 = 10%)';
export const ERR_ZERO_ADDRESS: string = 'Address cannot be zero';
export const ERR_NFT_TRANSFER_FAILED: string = 'NFT transfer failed';
export const ERR_NO_BIDS: string = 'No bids placed on this listing';
export const ERR_NOT_AUCTION: string = 'Cannot bid on fixed-price listings';
