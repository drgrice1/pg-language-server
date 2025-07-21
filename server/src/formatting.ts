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

export const formatDoc = async (
    _params: DocumentFormattingParams,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolder: WorkspaceFolder | undefined,
    connection: Connection
): Promise<TextEdit[] | undefined> => {
    return await maybeReturnEdits(
        Range.create(Position.create(0, 0), Position.create(txtDoc.lineCount, 0)),
        txtDoc,
        settings,
        workspaceFolder,
        connection
    );
};

export const formatRange = async (
    params: DocumentRangeFormattingParams,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolder: WorkspaceFolder | undefined,
    connection: Connection
): Promise<TextEdit[] | undefined> => {
    const offset = params.range.end.character > 0 ? 1 : 0;

    return await maybeReturnEdits(
        Range.create(Position.create(params.range.start.line, 0), Position.create(params.range.end.line + offset, 0)),
        txtDoc,
        settings,
        workspaceFolder,
        connection
    );
};

const maybeReturnEdits = async (
    range: Range,
    txtDoc: TextDocument,
    settings: PGLanguageServerSettings,
    workspaceFolder: WorkspaceFolder | undefined,
    connection: Connection
): Promise<TextEdit[] | undefined> => {
    const text = txtDoc.getText(range);
    if (!text) return;

    const progressToken = await startProgress(connection, 'Formatting doc');
    const tidiedSource = await pgTidy(text, settings, workspaceFolder);
    endProgress(connection, progressToken);

    // pg-perltidy.pl failed
    if (!tidiedSource) return;

    return [{ range: range, newText: tidiedSource }];
};

const pgTidy = async (
    code: string,
    settings: PGLanguageServerSettings,
    workspaceFolder: WorkspaceFolder | undefined
): Promise<string | undefined> => {
    if (!settings.perltidyEnabled) return;

    const tidyParams: string[] = [
        join(await getPerlAssetsPath(), 'pgTidyWrapper.pl'),
        ...getTidyProfile(workspaceFolder, settings)
    ];
    nLog('Now starting pg-perltidy with: ' + tidyParams.join(' '), settings);

    let output: string | Buffer;
    try {
        const process = async_execFile(settings.perlPath, settings.perlParams.concat(tidyParams), {
            timeout: 25000,
            maxBuffer: 20 * 1024 * 1024
        });
        process.child.stdin?.on('error', (error: string) => {
            nLog('pg-perltidy error caught: ', settings);
            nLog(error, settings);
        });
        process.child.stdin?.write(code);
        process.child.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: unknown) {
        nLog('pg-perltidy failed with unknown error', settings);
        nLog(error as string, settings);
        return;
    }

    const pieces = output.split('87ec3595-4186-45df-b647-13c11e67b138');
    if (pieces.length > 1) return pieces[1];
};

const getTidyProfile = (workspaceFolder: WorkspaceFolder | undefined, settings: PGLanguageServerSettings): string[] => {
    const profileCmd: string[] = [];
    if (settings.perltidyProfile) {
        const profile = settings.perltidyProfile;
        if (profile.includes('$workspaceFolder')) {
            if (workspaceFolder) {
                const workspaceUri = URI.parse(workspaceFolder.uri).fsPath;
                profileCmd.push('--profile');
                profileCmd.push(profile.replaceAll('$workspaceFolder', workspaceUri));
            } else {
                nLog(
                    'You specified $workspaceFolder in your perltidy path, ' +
                        "but didn't include a workspace folder. Ignoring profile.",
                    settings
                );
            }
        } else {
            profileCmd.push('--profile');
            profileCmd.push(profile);
        }
    }
    return profileCmd;
};
