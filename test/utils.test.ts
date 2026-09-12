import assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../server/src/parser';
import { lookupSymbol } from '../server/src/utils';
import { PerlSymbolKind, ElementSource, type PerlDocument, type PerlElement } from '../server/src/types';

const parse = (code: string) => parseDocument(TextDocument.create('file:///test.pg', 'perl', 1, code));

const emptyDoc = (): PerlDocument => ({
    elements: new Map(),
    canonicalElements: new Map(),
    autoloads: new Map(),
    imported: new Map(),
    parents: new Map(),
    uri: 'file:///test.pg'
});

const makeElement = (overrides: Partial<PerlElement> & Pick<PerlElement, 'name' | 'package'>): PerlElement => ({
    type: PerlSymbolKind.LocalSub,
    typeDetail: '',
    uri: 'file:///test.pg',
    line: 0,
    lineEnd: 0,
    value: '',
    source: ElementSource.parser,
    ...overrides
});

describe('lookupSymbol', function () {
    it('finds a plain sub by name', function () {
        const doc = parse('sub greet { }\n');
        const found = lookupSymbol(doc, new Map(), 'greet', 0);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].name, 'greet');
    });

    it('resolves $self->method to an unqualified sub of the same name', function () {
        const doc = parse('sub helper { }\nsub caller { $self->helper(); }\n');
        const found = lookupSymbol(doc, new Map(), '$self->helper', 1);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].name, 'helper');
    });

    it('falls back to a known module when the symbol is not in the document', function () {
        const doc = parse('');
        const modMap = new Map([['Value::Real', 'file:///Value.pm']]);
        const found = lookupSymbol(doc, modMap, 'Value::Real', 0);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].type, PerlSymbolKind.Module);
        assert.strictEqual(found[0].source, ElementSource.modHunter);
    });

    it('resolves $self->SUPER::method via the parents map', function () {
        const doc = emptyDoc();
        doc.elements.set('$self', [makeElement({ name: '$self', package: 'Child', line: 0 })]);
        doc.parents.set('Child', 'Parent');
        doc.elements.set('method', [makeElement({ name: 'method', package: 'Parent' })]);

        const found = lookupSymbol(doc, new Map(), '$self->SUPER::method', 5);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].package, 'Parent');
    });

    it('infers a package from a member sub when no explicit package element exists', function () {
        const doc = emptyDoc();
        doc.elements.set('helper', [makeElement({ name: 'helper', package: 'Some::Module' })]);

        const found = lookupSymbol(doc, new Map(), 'Some::Module', 0);
        assert.strictEqual(found.length, 1);
        assert.strictEqual(found[0].type, PerlSymbolKind.Package);
        assert.strictEqual(found[0].source, ElementSource.packageInference);
    });

    it('returns nothing for a symbol that cannot be resolved', function () {
        const doc = parse('');
        assert.deepStrictEqual(lookupSymbol(doc, new Map(), '$nope', 0), []);
    });
});
