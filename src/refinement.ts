import { TextDocumentPositionParams } from 'vscode-languageserver/node';
import { ElemSource, ParseType, PerlDocument, PerlElem, PerlSymbolKind } from './types';
import { parseFromUri } from './parser';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

export async function refineElementIfSub(
    elem: PerlElem,
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument
): Promise<PerlElem | undefined> {
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

    if (elem.source == ElemSource.parser && params && elem.line == params.position.line) {
        // We're typing the actual signature or hovering over the definition. No pop-up needed.
        return;
    }

    return await refineElement(elem, perlDoc);
}

export async function refineElement(elem: PerlElem, perlDoc: PerlDocument): Promise<PerlElem> {
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
        if ([PerlSymbolKind.Package, PerlSymbolKind.Class].includes(elem.type)) {
            refinedElems = doc.elems.get(elem.name);
        } else {
            // Looks up Foo::Bar::baz by only the function name baz
            // Will fail if you have multiple same name functions in the same file.
            const match = elem.name.match(/\w+$/);
            if (match) {
                refinedElems = doc.elems.get(match[0]);
            }
        }

        if (refinedElems && refinedElems.length == 1) {
            refined = refinedElems[0];
        }
    }
    return refined;
}

async function getUriFromElement(elem: PerlElem, perlDoc: PerlDocument): Promise<string | undefined> {
    if (await isFile(elem.uri)) return elem.uri;

    if (!elem.package) return;

    const elemResolved = perlDoc.elems.get(elem.package);
    if (!elemResolved) return;

    for (const potentialElem of elemResolved) {
        if (await isFile(potentialElem.uri)) {
            return potentialElem.uri;
        }
    }
}

async function isFile(uri: string): Promise<boolean> {
    const file = URI.parse(uri).fsPath;
    if (!file || file.length < 1) {
        return false;
    }
    try {
        const stats = await fs.promises.stat(file);
        return stats.isFile();
    } catch {
        // File or directory doesn't exist
        return false;
    }
}
