import assert from 'assert';
import { join } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../server/src/parser';
import { getAvailableMacros, resolveLoadedMacros } from '../server/src/navigation';
import { PerlSymbolKind, ElementSource, type PerlDocument, type PGLanguageServerSettings } from '../server/src/types';

const settings = { logging: false } as PGLanguageServerSettings;
const fixturesDir = join(__dirname, 'fixtures', 'macros');

const emptyDoc = (loadedMacros: string[]): PerlDocument => ({
    elements: new Map(),
    canonicalElements: new Map(),
    autoloads: new Map(),
    imported: new Map(),
    parents: new Map(),
    uri: 'file:///problem.pg',
    loadedMacros
});

describe('resolveLoadedMacros', function () {
    it('recursively merges macros loaded by other macros, guarding against cycles', async function () {
        const macroPaths = new Map([
            ['A.pl', join(fixturesDir, 'A.pl')],
            ['B.pl', join(fixturesDir, 'B.pl')],
            ['C.pl', join(fixturesDir, 'C.pl')]
        ]);
        const perlDoc = emptyDoc(['A.pl', 'C.pl']);
        const cache = new Map<string, PerlDocument>();

        await resolveLoadedMacros(perlDoc, macroPaths, cache, settings);

        // A.pl -> loads B.pl -> loads A.pl again (cycle); C.pl is a leaf.
        assert.ok(perlDoc.elements.has('fooA'));
        assert.ok(perlDoc.elements.has('fooB'));
        assert.ok(perlDoc.elements.has('fooC'));
        assert.strictEqual(cache.size, 3);
    });

    it('lets the document keep its own definition over a same-named macro symbol', async function () {
        const macroPaths = new Map([['A.pl', join(fixturesDir, 'A.pl')]]);
        const perlDoc = emptyDoc(['A.pl']);
        perlDoc.elements.set('fooA', [
            {
                name: 'fooA',
                type: PerlSymbolKind.LocalSub,
                typeDetail: 'own-definition',
                uri: perlDoc.uri,
                package: '',
                line: 0,
                lineEnd: 0,
                value: '',
                source: ElementSource.parser
            }
        ]);

        await resolveLoadedMacros(perlDoc, macroPaths, new Map(), settings);

        assert.strictEqual(perlDoc.elements.get('fooA')?.[0]?.typeDetail, 'own-definition');
    });

    it('skips a macro name that cannot be resolved to a file, without throwing', async function () {
        const perlDoc = emptyDoc(['DoesNotExist.pl']);
        await resolveLoadedMacros(perlDoc, new Map(), new Map(), settings);
        assert.strictEqual(perlDoc.elements.size, 0);
    });

    it('resolves real PG macros end to end (regression check against the vendored macros/ tree)', async function () {
        const macroPaths = await getAvailableMacros(undefined, settings);
        const document = TextDocument.create(
            'file:///problem.pg',
            'perl',
            1,
            "DOCUMENT();\nloadMacros('PGstandard.pl', 'MathObjects.pl');\n"
        );
        const perlDoc = parseDocument(document);

        await resolveLoadedMacros(perlDoc, macroPaths, new Map(), settings);

        assert.ok(perlDoc.elements.has('Real'), 'Real (from Value.pl, via MathObjects.pl) should resolve');
        assert.ok(perlDoc.elements.has('Compute'), 'Compute (from Parser.pl, via MathObjects.pl) should resolve');
    });
});
