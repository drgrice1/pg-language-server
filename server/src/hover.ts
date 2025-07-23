import type { TextDocumentPositionParams, Hover } from 'vscode-languageserver/node';
import { MarkupKind } from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { type PerlDocument, type PerlElement, PerlSymbolKind } from './types';
import { getSymbol, lookupSymbol } from './utils';
import { refineElementIfSub } from './refinement';
import { getPod } from './pod';

import { URI } from 'vscode-uri';

export const getHover = async (
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument,
    txtDoc: TextDocument,
    modMap: Map<string, string>
): Promise<Hover | undefined> => {
    const position = params.position;
    const symbol = getSymbol(position, txtDoc);

    let element = perlDoc.canonicalElements.get(symbol);

    if (!element) {
        const elements = lookupSymbol(perlDoc, modMap, symbol, position.line);
        // Nothing or too many things.
        if (elements.length !== 1) return;
        element = elements[0];
    }

    const refined = await refineElementIfSub(element, params, perlDoc);

    const title = buildHoverDoc(symbol, element, refined);

    // Sometimes, there's nothing worth showing.
    // I'm assuming we won't get any useful POD if we can't get a useful title. Could be wrong
    if (!title) return;

    let merged = title;

    let docs = await getPod(element, perlDoc, modMap);

    if (docs) {
        if (!docs.startsWith('\n')) docs = `\n${docs}`; // Markdown requires two newlines to make one
        merged += `\n${docs}`;
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: merged
        }
    };
};

const buildHoverDoc = (symbol: string, element: PerlElement, refined: PerlElement | undefined): string | undefined => {
    if ([PerlSymbolKind.LocalVar, PerlSymbolKind.ImportedVar, PerlSymbolKind.Canonical].includes(element.type)) {
        if (element.typeDetail.length > 0) return `(object) ${element.typeDetail}`;
        else if (symbol.startsWith('$self'))
            // We either know the object type, or it's $self
            return `(object) ${element.package}`;
    }

    let sig = '';
    let name = element.name;

    if (refined?.signature) {
        let signature = refined.signature;
        signature = [...signature];
        if (symbol.includes('->') && refined.type != PerlSymbolKind.LocalMethod) {
            signature.shift();
            name = name.replace(/::(\w+)$/, '->$1');
        }
        if (signature.length > 0) sig = '(' + signature.join(', ') + ')';
    }
    let desc;
    switch (element.type) {
        case PerlSymbolKind.ImportedSub: // inherited methods can still be subs (e.g. new from a parent)
        case PerlSymbolKind.Inherited:
            desc = `(subroutine) ${name}${sig}`;
            if (element.typeDetail && element.typeDetail != element.name) desc += `  [${element.typeDetail}]`;
            break;
        case PerlSymbolKind.LocalSub:
            desc = `(subroutine) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalMethod:
        case PerlSymbolKind.Method:
            desc = `(method) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalVar:
            // Not very interesting info
            // desc = `(variable) ${symbol}`;
            break;
        case PerlSymbolKind.ImportedVar:
            desc = `${name}: ${element.value}`;
            if (element.package) desc += ` [${element.package}]`; // Is this ever known?
            break;
        case PerlSymbolKind.ImportedHash:
            desc = `${element.name}  [${element.package}]`;
            break;
        case PerlSymbolKind.Package:
            desc = `(package) ${element.name}`;
            break;
        case PerlSymbolKind.Module: {
            desc = `(module) ${element.name}: ${URI.parse(element.uri).fsPath}`;
            break;
        }
        case PerlSymbolKind.Label:
            desc = `(label) ${symbol}`;
            break;
        case PerlSymbolKind.Phaser:
            desc = `(phase) ${symbol}`;
            break;
        case PerlSymbolKind.HttpRoute:
        case PerlSymbolKind.OutlineOnlySub:
            // You cant go-to or hover on a route or outline only sub.
            break;
        case PerlSymbolKind.AutoLoadVar:
            desc = `(autoloaded) ${symbol}`;
            break;
        default:
            // We should never get here
            desc = `Unknown: ${element.name}`;
            break;
    }
    return desc;
};
