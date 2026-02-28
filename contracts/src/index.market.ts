import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { AgentVaultMarketplace } from './AgentVaultMarketplace';

export * from '@btc-vision/btc-runtime/runtime/exports';

Blockchain.contract = () => {
    return new AgentVaultMarketplace();
};

export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
