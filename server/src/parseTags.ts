import { URI } from 'vscode-uri';
import { type PerlDocument, type PerlElem, PerlSymbolKind, TagKind, ElemSource } from './types';

export const buildNav = (stdout: string, _filePath: string, fileuri: string): PerlDocument => {
    stdout = stdout.replaceAll('\r', ''); // Windows

    const perlDoc: PerlDocument = {
        elems: new Map(),
        canonicalElems: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        uri: fileuri
    };

    stdout.split('\n').forEach((perl_elem) => {
        parseElem(perl_elem, perlDoc);
    });

    return perlDoc;
};

const parseElem = (perlTag: string, perlDoc: PerlDocument): void => {
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

    if (type == TagKind.UseStatement) {
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, startLine);
        // TODO: Build mapping of common constructors to types
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true);
        return; // Don't store it as an element
    }

    if (type == TagKind.Canonical2) {
        perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    }

    // Add anyway
    const newElem: PerlElem = {
        name: name,
        type: type as PerlSymbolKind,
        typeDetail: typeDetail,
        uri: URI.file(file).toString(),
        package: pack,
        line: startLine,
        lineEnd: endLine,
        value: value,
        source: ElemSource.symbolTable
    };

    // Move fancy object types into the typeDetail field????
    if (type.length > 1) {
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElems.set(name, newElem);
    }

    if (type == PerlSymbolKind.Canonical) {
        // This object is only intended as the canonicalLookup, not for anything else.
        // This doesn't do anything until fancy object types are moved into the typeDetail field
        return;
    }

    if (type == PerlSymbolKind.AutoLoadVar) {
        perlDoc.autoloads.set(name, newElem);
        return; // Don't store it as an element
    }

    addVal(perlDoc.elems, name, newElem);

    return;
};

const addVal = (map: Map<string, unknown[]>, key: string, value: unknown) => {
    const array = map.get(key) || [];
    array.push(value);
    map.set(key, array);
};
