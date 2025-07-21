import type { ExtensionContext } from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import { join } from 'path';

let client: LanguageClient | undefined;

export const activate = (context: ExtensionContext) => {
    const serverModule = context.asAbsolutePath(join('dist', 'server.js'));

    client = new LanguageClient(
        'PGLanguageServer',
        'Perl Navigator LSP',
        // Server options
        {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: { execArgv: ['--nolazy', '--inspect=6009'] }
            }
        },
        // Client options
        {
            documentSelector: [
                { scheme: 'file', pattern: '**/*.pg' },
                { scheme: 'untitled', language: 'pg' }
            ],
            synchronize: { configurationSection: 'pg' }
        }
    );

    void client.start();
};

export const deactivate = (): Thenable<void> | undefined => {
    if (!client) return;
    return client.stop();
};
