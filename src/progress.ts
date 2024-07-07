import { Connection } from 'vscode-languageserver/node';
import { NavigatorSettings } from './types';
import { WorkDoneProgressBegin, WorkDoneProgressEnd, WorkDoneProgress } from 'vscode-languageserver-protocol';

export async function startProgress(
    connection: Connection,
    title: string,
    settings: NavigatorSettings
): Promise<string | null> {
    if (!settings.enableProgress) return null;

    const progressToken = (await import('nanoid/non-secure')).nanoid();

    await connection.sendRequest('window/workDoneProgress/create', { token: progressToken });

    const beginReport: WorkDoneProgressBegin = { title, cancellable: false, kind: 'begin' };

    connection.sendProgress(WorkDoneProgress.type, progressToken, beginReport);

    return progressToken;
}

export function endProgress(connection: Connection, progressToken: string | null) {
    if (!progressToken) return;

    const endReport = <WorkDoneProgressEnd>{ kind: 'end' };
    connection.sendProgress(WorkDoneProgress.type, progressToken, endReport);
    return;
}
