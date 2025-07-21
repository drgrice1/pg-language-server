import type { TextDocumentPositionParams } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import { ElementSource, ParseType, type PerlDocument, type PerlElement, PerlSymbolKind } from './types';
import { parseFromUri } from './parser';

export const refineElementIfSub = async (
    element: PerlElement,
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument
): Promise<PerlElement | undefined> => {
    if (
        ![
            PerlSymbolKind.LocalSub,
            PerlSymbolKind.ImportedSub,
            PerlSymbolKind.Inherited,
            PerlSymbolKind.LocalMethod,
            PerlSymbolKind.Method
        ].includes(element.type)
    ) {
        return;
    }

    // The actual signature is being typed or the cursor is hovering over the definition. No pop-up needed.
    if (element.source == ElementSource.parser && element.line == params.position.line) return;

    return await refineElement(element, perlDoc);
};

export const refineElement = async (element: PerlElement, perlDoc: PerlDocument): Promise<PerlElement> => {
    // Return the original element if it can't be refined.
    let refined: PerlElement = element;
    if (element.source == ElementSource.parser || element.source == ElementSource.modHunter) {
        refined = element;
    } else {
        const resolvedUri = await getUriFromElement(element, perlDoc);
        if (!resolvedUri) return refined;

        const doc = await parseFromUri(resolvedUri, ParseType.refinement);
        if (!doc) return refined;

        let refinedElements: PerlElement[] | undefined;
        if (element.type === PerlSymbolKind.Package) {
            refinedElements = doc.elements.get(element.name);
        } else {
            // Looks up Foo::Bar::baz by only the function name baz.
            // This will fail if there are multiple functions by the same name in one file.
            const match = /\w+$/.exec(element.name);
            if (match) refinedElements = doc.elements.get(match[0]);
        }

        if (refinedElements && refinedElements.length == 1) refined = refinedElements[0];
    }
    return refined;
};

const getUriFromElement = async (element: PerlElement, perlDoc: PerlDocument): Promise<string | undefined> => {
    if (await isFile(element.uri)) return element.uri;

    if (!element.package) return;

    const elementResolved = perlDoc.elements.get(element.package);
    if (!elementResolved) return;

    for (const potentialElement of elementResolved) {
        if (await isFile(potentialElement.uri)) return potentialElement.uri;
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
