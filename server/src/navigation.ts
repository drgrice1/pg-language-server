import type { DefinitionParams, Location, WorkspaceFolder } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { realpath } from 'fs/promises';
import { join } from 'path';
import { type PerlDocument, type PerlElement, type PGLanguageServerSettings, PerlSymbolKind } from './types';
import { getIncPaths, async_execFile, getSymbol, lookupSymbol, nLog, isFile, getPerlAssetsPath } from './utils';
import { refineElement } from './refinement';

export const getDefinition = async (
    params: DefinitionParams,
    perlDoc: PerlDocument,
    txtDoc: TextDocument,
    modMap: Map<string, string>
): Promise<Location[] | undefined> => {
    const position = params.position;
    const symbol = getSymbol(position, txtDoc);

    if (!symbol) return;

    const foundElements = lookupSymbol(perlDoc, modMap, symbol, position.line);

    if (foundElements.length == 0) return;

    const locationsFound: Location[] = [];

    for (const element of foundElements) {
        const elementResolved: PerlElement | undefined = await resolveElementForNav(perlDoc, element, symbol);
        if (!elementResolved) continue;

        let uri: string;
        if (perlDoc.uri !== elementResolved.uri) {
            // If sending to a different file, make sure it exists and clean up the path.
            const file = URI.parse(elementResolved.uri).fsPath;

            if (!(await isFile(file))) continue; // Make sure the file exists and hasn't been deleted.

            try {
                uri = URI.file(await realpath(file)).toString(); // Resolve symlinks
            } catch {
                continue;
            }
        } else {
            // Sending to current file (including untitled files)
            uri = perlDoc.uri;
        }

        const newLoc: Location = {
            uri: uri,
            range: {
                start: { line: elementResolved.line, character: 0 },
                end: { line: elementResolved.line, character: 500 }
            }
        };

        locationsFound.push(newLoc);
    }

    return locationsFound;
};

const resolveElementForNav = async (
    perlDoc: PerlDocument,
    element: PerlElement,
    symbol: string
): Promise<PerlElement | undefined> => {
    const refined = await refineElement(element, perlDoc).catch(() => undefined);
    element = refined ?? element;
    if (!badFile(element.uri)) {
        if (perlDoc.uri == element.uri && symbol.includes('->')) {
            // Corinna methods don't have line numbers. So hunt for them.
            // If nothing better is found, return the original element.
            const method = symbol.split('->').pop();
            if (method) {
                const found = perlDoc.elements.get(method);
                if (found) {
                    if (element.line == 0 && element.type == PerlSymbolKind.Method) {
                        if (found[0].uri == perlDoc.uri) return found[0];
                    } else if (element.line > 0 && element.type == PerlSymbolKind.ImportedSub) {
                        // Solve the off-by-one error at least for these.
                        // Eventually, you could consult a tagger for this step.

                        for (const potentialElement of found) {
                            if (Math.abs(potentialElement.line - element.line) <= 1) return potentialElement;
                        }
                    }
                }
            }
            // Otherwise give-up
        }

        // Normal path; file is good
        return element;
    } else {
        // Try looking it up by package instead of file.
        // Happens with XS subs and Moo subs
        if (element.package) {
            const elementResolved = perlDoc.elements.get(element.package);
            if (elementResolved) {
                for (const potentialElement of elementResolved) {
                    if (potentialElement.uri && !badFile(potentialElement.uri)) return potentialElement;
                }
            }
        }
    }
    return;
};

const badFile = (uri: string): boolean => {
    if (!uri) return true;

    const fsPath = URI.parse(uri).fsPath;

    // Single forward slashes seem to sneak in here.
    if (!fsPath || fsPath.length <= 1) return true;

    return /(?:Sub[\\/]Defer\.pm|Moo[\\/]Object\.pm|Moose[\\/]Object\.pm|\w+\.c|Inspectorito\.pm)$/.test(fsPath);
};

export const getAvailableMods = async (
    workspaceFolder: WorkspaceFolder | undefined,
    settings: PGLanguageServerSettings
): Promise<Map<string, string>> => {
    const perlParams = settings.perlParams.concat(getIncPaths(workspaceFolder, settings));
    perlParams.push(join(getPerlAssetsPath(), 'ModHunter.pl'));
    nLog('Starting to look for perl modules with ' + perlParams.join(' '), settings);

    const mods = new Map<string, string>();

    let output: string;
    try {
        // This can be slow, especially if reading modules over a network or on windows.
        const out = await async_execFile(settings.perlPath, perlParams, {
            timeout: 90000,
            maxBuffer: 20 * 1024 * 1024
        });
        output = out.stdout;
        nLog('Success running mod hunter', settings);
    } catch (error: unknown) {
        nLog('ModHunter failed. Autocomplete on imported modules will not work.', settings);
        nLog(error as string, settings);
        return mods;
    }

    for (const mod of output.split('\n')) {
        const items = mod.split('\t');

        if (items.length != 5 || items[1] != 'M' || !items[2] || !items[3]) continue;

        try {
            const path = await realpath(items[3]); // Resolve symlinks
            mods.set(items[2], URI.file(path).toString());
        } catch {
            /* Ignore */
        }
    }
    return mods;
};
