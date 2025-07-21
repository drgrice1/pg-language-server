import { URI } from 'vscode-uri';
import { type PerlDocument, type PerlElement, PerlSymbolKind, TagKind, ElementSource } from './types';

export const buildNav = (stdout: string, _filePath: string, fileuri: string): PerlDocument => {
    stdout = stdout.replaceAll('\r', ''); // Windows

    const perlDoc: PerlDocument = {
        elements: new Map(),
        canonicalElements: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        uri: fileuri
    };

    for (const perlElement of stdout.split('\n')) {
        parseElement(perlElement, perlDoc);
    }

    return perlDoc;
};

const parseElement = (perlTag: string, perlDoc: PerlDocument): void => {
    const items = perlTag.split('\t');

    if (items.length != 7) {
        return;
    }
    if (!items[0] || items[0] == '_') return; // Need a look-up key

    const name = items[0];
    const type = items[1] || '';
    const typeDetail = items[2] || '';
    const file = items[3] || '';
    const pack = items[4] || '';

    const lines = items[5].split(';');

    const startLine = lines[0] ? +lines[0] : 0;
    const endLine = lines[1] ? +lines[1] : startLine;

    const value = items[6] || '';

    if (type == TagKind.UseStatement.valueOf()) {
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, startLine);
        // TODO: Build mapping of common constructors to types
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true);
        return; // Don't store it as an element
    }

    if (type == TagKind.Canonical2.valueOf()) {
        perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    }

    // Add anyway
    const newElement: PerlElement = {
        name: name,
        type: type as PerlSymbolKind,
        typeDetail: typeDetail,
        uri: URI.file(file).toString(),
        package: pack,
        line: startLine,
        lineEnd: endLine,
        value: value,
        source: ElementSource.symbolTable
    };

    // Move fancy object types into the typeDetail field????
    if (type.length > 1) {
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElements.set(name, newElement);
    }

    // This object is only intended as the canonicalLookup, not for anything else.
    // This doesn't do anything until fancy object types are moved into the typeDetail field
    if (type == PerlSymbolKind.Canonical.valueOf()) return;

    if (type == PerlSymbolKind.AutoLoadVar.valueOf()) {
        perlDoc.autoloads.set(name, newElement);
        return; // Don't store it as an element
    }

    addVal(perlDoc.elements, name, newElement);

    return;
};

const addVal = (map: Map<string, unknown[]>, key: string, value: unknown) => {
    const array = map.get(key) ?? [];
    array.push(value);
    map.set(key, array);
};
