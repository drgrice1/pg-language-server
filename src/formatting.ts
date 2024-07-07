import {
    DocumentFormattingParams,
    TextEdit,
    DocumentRangeFormattingParams,
    Position,
    Range,
    WorkspaceFolder
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { NavigatorSettings } from './types';
import { async_execFile, getPerlimportsProfile, nLog } from './utils';
import { join } from 'path';
import { URI } from 'vscode-uri';
import { getPerlAssetsPath } from './assets';
import { startProgress, endProgress } from './progress';
import { Connection } from 'vscode-languageserver/node';

export async function formatDoc(
    _params: DocumentFormattingParams,
    txtDoc: TextDocument,
    settings: NavigatorSettings,
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
    settings: NavigatorSettings,
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
    settings: NavigatorSettings,
    workspaceFolders: WorkspaceFolder[] | null,
    connection: Connection
): Promise<TextEdit[] | undefined> {
    const text = txtDoc.getText(range);
    if (!text) {
        return;
    }

    const progressToken = await startProgress(connection, 'Formatting doc', settings);
    let newSource: string = '';
    const fixedImports = await perlimports(txtDoc, text, settings);
    if (fixedImports) {
        newSource = fixedImports;
    }
    const tidedSource = await perltidy(fixedImports || text, settings, workspaceFolders);
    if (tidedSource) {
        newSource = tidedSource;
    }
    endProgress(connection, progressToken);

    if (!newSource) {
        // If we failed on both tidy and imports
        return;
    }

    const edits: TextEdit = {
        range: range,
        newText: newSource
    };
    return [edits];
}

async function perlimports(doc: TextDocument, code: string, settings: NavigatorSettings): Promise<string | undefined> {
    if (!settings.perlimportsTidyEnabled) return;
    const importsPath = join(await getPerlAssetsPath(), 'perlimportsWrapper.pl');
    let cliParams: string[] = [importsPath].concat(getPerlimportsProfile(settings));
    cliParams = cliParams.concat(['--filename', URI.parse(doc.uri).fsPath]);
    nLog('Now starting perlimports with: ' + cliParams.join(' '), settings);

    try {
        const process = async_execFile(settings.perlPath, settings.perlParams.concat(cliParams), {
            timeout: 25000,
            maxBuffer: 20 * 1024 * 1024
        });
        process?.child?.stdin?.on('error', (error: string) => {
            nLog('perlImports Error Caught: ', settings);
            nLog(error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        return out.stdout;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        nLog('Attempted to run perlimports tidy ' + error.stdout, settings);
        return;
    }
}

async function perltidy(
    code: string,
    settings: NavigatorSettings,
    workspaceFolders: WorkspaceFolder[] | null
): Promise<string | undefined> {
    if (!settings.perltidyEnabled) return;
    const tidy_path = join(await getPerlAssetsPath(), 'tidyWrapper.pl');
    const tidyParams: string[] = [tidy_path].concat(getTidyProfile(workspaceFolders, settings));

    nLog('Now starting perltidy with: ' + tidyParams.join(' '), settings);

    let output: string | Buffer;
    try {
        const process = async_execFile(settings.perlPath, settings.perlParams.concat(tidyParams), {
            timeout: 25000,
            maxBuffer: 20 * 1024 * 1024
        });
        process?.child?.stdin?.on('error', (error: string) => {
            nLog('PerlTidy Error Caught: ', settings);
            nLog(error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: unknown) {
        nLog('Perltidy failed with unknown error', settings);
        nLog(error as string, settings);
        return;
    }

    const pieces = output.split('ee4ffa34-a14f-4609-b2e4-bf23565f3262');
    if (pieces.length > 1) {
        return pieces[1];
    } else {
        return;
    }
}

function getTidyProfile(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): string[] {
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
                    "You specified $workspaceFolder in your perltidy path, but didn't include any workspace folders. Ignoring profile.",
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
