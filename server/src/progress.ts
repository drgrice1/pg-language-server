import type { Connection } from 'vscode-languageserver/node';
import { WorkDoneProgress } from 'vscode-languageserver-protocol';
import { v4 as uuidv4 } from 'uuid';

export const startProgress = async (connection: Connection, title: string): Promise<string | null> => {
    const progressToken = uuidv4();
    await connection.sendRequest('window/workDoneProgress/create', { token: progressToken });
    connection.sendProgress(WorkDoneProgress.type, progressToken, { title, cancellable: false, kind: 'begin' });
    return progressToken;
};

export const endProgress = (connection: Connection, progressToken: string | null) => {
    if (!progressToken) return;
    connection.sendProgress(WorkDoneProgress.type, progressToken, { kind: 'end' });
};
