import type { TextDocumentPositionParams } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import { ElemSource, ParseType, type PerlDocument, type PerlElem, PerlSymbolKind } from './types';
import { parseFromUri } from './parser';

export const refineElementIfSub = async (
    elem: PerlElem,
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument
): Promise<PerlElem | undefined> => {
    if (
        ![
            PerlSymbolKind.LocalSub,
            PerlSymbolKind.ImportedSub,
            PerlSymbolKind.Inherited,
            PerlSymbolKind.LocalMethod,
            PerlSymbolKind.Method
        ].includes(elem.type)
    ) {
        return;
    }

    if (elem.source == ElemSource.parser && elem.line == params.position.line) {
        // We're typing the actual signature or hovering over the definition. No pop-up needed.
        return;
    }

    return await refineElement(elem, perlDoc);
};

export const refineElement = async (elem: PerlElem, perlDoc: PerlDocument): Promise<PerlElem> => {
    // Return back the original if you can't refine
    let refined: PerlElem = elem;
    if (elem.source == ElemSource.parser || elem.source == ElemSource.modHunter) {
        refined = elem;
    } else {
        const resolvedUri = await getUriFromElement(elem, perlDoc);
        if (!resolvedUri) return refined;

        const doc = await parseFromUri(resolvedUri, ParseType.refinement);
        if (!doc) return refined;

        let refinedElems: PerlElem[] | undefined;
        if (elem.type === PerlSymbolKind.Package) {
            refinedElems = doc.elems.get(elem.name);
        } else {
            // Looks up Foo::Bar::baz by only the function name baz.
            // This will fail if there are multiple functions by the same name in one file.
            const match = /\w+$/.exec(elem.name);
            if (match) refinedElems = doc.elems.get(match[0]);
        }

        if (refinedElems && refinedElems.length == 1) refined = refinedElems[0];
    }
    return refined;
};

const getUriFromElement = async (elem: PerlElem, perlDoc: PerlDocument): Promise<string | undefined> => {
    if (await isFile(elem.uri)) return elem.uri;

    if (!elem.package) return;

    const elemResolved = perlDoc.elems.get(elem.package);
    if (!elemResolved) return;

    for (const potentialElem of elemResolved) {
        if (await isFile(potentialElem.uri)) return potentialElem.uri;
    }
};

const isFile = async (uri: string): Promise<boolean> => {
    const file = URI.parse(uri).fsPath;
    if (!file || file.length < 1) return false;
    try {
        const stats = await fs.promises.stat(file);
        return stats.isFile();
    } catch {
        // File or directory doesn't exist
        return false;
    }
};
