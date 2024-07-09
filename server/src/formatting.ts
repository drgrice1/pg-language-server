import type {
    Connection,
    DocumentFormattingParams,
    TextEdit,
    DocumentRangeFormattingParams,
    WorkspaceFolder
} from 'vscode-languageserver/node';
import { Position, Range } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { join } from 'path';
import { URI } from 'vscode-uri';
import type { PGLanguageServerSettings } from './types';
import { async_execFile, nLog } from './utils';
import { getPerlAssetsPath } from './assets';
import { startProgress, endProgress } from './progress';

export async function formatDoc(
    _params: DocumentFormattingParams,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolders: WorkspaceFolder[] | null,
    connection: Connection
): Promise<TextEdit[] | undefined> {
    return await maybeReturnEdits(
        Range.create(Position.create(0, 0), Position.create(txtDoc.lineCount, 0)),
        txtDoc,
        settings,
        workspaceFolders,
        connection
    );
}

export async function formatRange(
    params: DocumentRangeFormattingParams,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolders: WorkspaceFolder[] | null,
    connection: Connection
): Promise<TextEdit[] | undefined> {
    const offset = params.range.end.character > 0 ? 1 : 0;

    return await maybeReturnEdits(
        Range.create(Position.create(params.range.start.line, 0), Position.create(params.range.end.line + offset, 0)),
        txtDoc,
        settings,
        workspaceFolders,
        connection
    );
}

async function maybeReturnEdits(
    range: Range,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolders: WorkspaceFolder[] | null,
    connection: Connection
): Promise<TextEdit[] | undefined> {
    const text = txtDoc.getText(range);
    if (!text) {
        return;
    }

    const progressToken = await startProgress(connection, 'Formatting doc', settings);
    const tidiedSource = await pgTidy(text, settings, workspaceFolders);
    endProgress(connection, progressToken);

    // pg-perltidy.pl failed
    if (!tidiedSource) return;

    return [
        {
            range: range,
            newText: tidiedSource
        }
    ];
}

async function pgTidy(
    code: string,
    settings: PGLanguageServerSettings,
    workspaceFolders: WorkspaceFolder[] | null
): Promise<string | undefined> {
    if (!settings.perltidyEnabled) return;

    const tidyParams: string[] = [
        join(await getPerlAssetsPath(), 'pgTidyWrapper.pl'),
        ...getTidyProfile(workspaceFolders, settings)
    ];
    nLog('Now starting pg-perltidy with: ' + tidyParams.join(' '), settings);

    let output: string | Buffer;
    try {
        const process = async_execFile(settings.perlPath, settings.perlParams.concat(tidyParams), {
            timeout: 25000,
            maxBuffer: 20 * 1024 * 1024
        });
        process?.child?.stdin?.on('error', (error: string) => {
            nLog('pg-perltidy error caught: ', settings);
            nLog(error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: unknown) {
        nLog('pg-perltidy failed with unknown error', settings);
        nLog(error as string, settings);
        return;
    }

    const pieces = output.split('87ec3595-4186-45df-b647-13c11e67b138');
    if (pieces.length > 1) {
        return pieces[1];
    } else {
        return;
    }
}

function getTidyProfile(workspaceFolders: WorkspaceFolder[] | null, settings: PGLanguageServerSettings): string[] {
    const profileCmd: string[] = [];
    if (settings.perltidyProfile) {
        const profile = settings.perltidyProfile;
        if (profile.indexOf('$workspaceFolder') != -1) {
            if (workspaceFolders) {
                // TODO: Fix this. Only uses the first workspace folder
                const workspaceUri = URI.parse(workspaceFolders[0].uri).fsPath;
                profileCmd.push('--profile');
                profileCmd.push(profile.replaceAll('$workspaceFolder', workspaceUri));
            } else {
                nLog(
                    'You specified $workspaceFolder in your perltidy path, ' +
                        "but didn't include any workspace folders. Ignoring profile.",
                    settings
                );
            }
        } else {
            profileCmd.push('--profile');
            profileCmd.push(profile);
        }
    }
    return profileCmd;
}
