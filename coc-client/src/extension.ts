import { type ExtensionContext, workspace, services, LanguageClient, TransportKind } from 'coc.nvim';
import { join } from 'path';

export const activate = async (context: ExtensionContext): Promise<void> => {
    if (!workspace.getConfiguration('coc-pg').get<boolean>('enable', true)) return;

    const serverModule = context.asAbsolutePath(join('..', 'dist', 'server.js'));

    const client = new LanguageClient(
        'PGLanguageServer',
        'PG Language Server',
        // Server options
        {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: {
                module: serverModule,
                transport: TransportKind.ipc,
                options: { execArgv: ['--nolazy', '--inspect=6045'] }
            }
        },
        // Client options
        {
            documentSelector: [
                { scheme: 'file', pattern: '**/*.pg' },
                { scheme: 'untitled', language: 'pg' }
            ]
        }
    );

    context.subscriptions.push(services.registerLanguageClient(client));
};
