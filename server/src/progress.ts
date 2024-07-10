import type { Connection } from 'vscode-languageserver/node';
import type { PGLanguageServerSettings } from './types';
import { type WorkDoneProgressBegin, type WorkDoneProgressEnd, WorkDoneProgress } from 'vscode-languageserver-protocol';

export const startProgress = async (
    connection: Connection,
    title: string,
    settings: PGLanguageServerSettings
): Promise<string | null> => {
    if (!settings.enableProgress) return null;
    const progressToken = (await import('nanoid/non-secure')).nanoid();
    await connection.sendRequest('window/workDoneProgress/create', { token: progressToken });
    const beginReport: WorkDoneProgressBegin = { title, cancellable: false, kind: 'begin' };
    connection.sendProgress(WorkDoneProgress.type, progressToken, beginReport);
    return progressToken;
};

export const endProgress = (connection: Connection, progressToken: string | null) => {
    if (!progressToken) return;
    const endReport = <WorkDoneProgressEnd>{ kind: 'end' };
    connection.sendProgress(WorkDoneProgress.type, progressToken, endReport);
    return;
};
