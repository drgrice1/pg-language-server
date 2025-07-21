import {
    type SymbolInformation,
    SymbolKind,
    type Location,
    type WorkspaceSymbolParams
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { ParseType, PerlSymbolKind } from './types';
import { parseDocument } from './parser';

export const getSymbols = async (textDocument: TextDocument, uri: string): Promise<SymbolInformation[]> => {
    const perlDoc = await parseDocument(textDocument, ParseType.outline);

    const symbols: SymbolInformation[] = [];
    for (const [elemName, elements] of perlDoc.elems) {
        for (const element of elements) {
            let kind: SymbolKind;
            switch (element.type) {
                case PerlSymbolKind.LocalSub:
                case PerlSymbolKind.OutlineOnlySub:
                    kind = SymbolKind.Function;
                    break;
                case PerlSymbolKind.LocalMethod:
                    kind = SymbolKind.Method;
                    break;
                case PerlSymbolKind.Package:
                    kind = SymbolKind.Package;
                    break;
                case PerlSymbolKind.Label:
                    kind = SymbolKind.Key;
                    break;
                case PerlSymbolKind.Phaser:
                    kind = SymbolKind.Event;
                    break;
                case PerlSymbolKind.HttpRoute:
                    kind = SymbolKind.Interface;
                    break;
                default:
                    continue;
            }
            const location: Location = {
                range: {
                    start: { line: element.line, character: 0 },
                    end: { line: element.lineEnd, character: 100 }
                },
                uri: uri
            };
            const newSymbol: SymbolInformation = {
                kind: kind,
                location: location,
                name: elemName
            };

            symbols.push(newSymbol);
        }
    }

    return symbols;
};

export const getWorkspaceSymbols = (
    _params: WorkspaceSymbolParams,
    defaultMods: Map<string, string>
): Promise<SymbolInformation[]> => {
    return new Promise((resolve) => {
        const symbols: SymbolInformation[] = [];

        // const lcQuery = params.query.toLowerCase(); // Currently unused.
        for (const [modName, modUri] of defaultMods) {
            // Just send the whole list and let the client sort through it with fuzzy search
            // if(!lcQuery || modName.toLowerCase().startsWith(lcQuery)){

            const location: Location = {
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 100 }
                },
                uri: modUri
            };

            symbols.push({
                name: modName,
                kind: SymbolKind.Module,
                location: location
            });
        }
        resolve(symbols);
    });
};
