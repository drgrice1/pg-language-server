import assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { parseDocument } from '../server/src/parser';
import { PerlSymbolKind, type PerlElement } from '../server/src/types';

const parse = (code: string) => parseDocument(TextDocument.create('file:///test.pg', 'perl', 1, code));

const only = (elements: PerlElement[] | undefined): PerlElement => {
    assert.ok(elements, 'expected element to be found');
    assert.strictEqual(elements.length, 1);
    return elements[0];
};

describe('parseDocument', function () {
    describe('packages', function () {
        it('finds a semicolon-form package and its qualified name', function () {
            const doc = parse('package Foo::Bar;\n');
            const element = only(doc.elements.get('Foo::Bar'));
            assert.strictEqual(element.type, PerlSymbolKind.Package);
            assert.strictEqual(element.line, 0);
        });

        it('scopes a semicolon-form package to the next package statement', function () {
            // The last package's scope runs to the end of the file (here, the trailing newline's own empty line).
            const doc = parse('package Foo;\nsub a { }\npackage Bar;\nsub b { }\n');
            const foo = only(doc.elements.get('Foo'));
            const bar = only(doc.elements.get('Bar'));
            assert.strictEqual(foo.lineEnd, 1);
            assert.strictEqual(bar.lineEnd, 4);
            assert.strictEqual(only(doc.elements.get('a')).package, 'Foo');
            assert.strictEqual(only(doc.elements.get('b')).package, 'Bar');
        });

        it('scopes a block-form package to its own block', function () {
            const doc = parse('package Foo {\n    sub a { }\n}\nsub b { }\n');
            const foo = only(doc.elements.get('Foo'));
            assert.strictEqual(foo.lineEnd, 2);
            assert.strictEqual(only(doc.elements.get('a')).package, 'Foo');
            // Subs outside the block-form package belong to no package (main).
            assert.strictEqual(only(doc.elements.get('b')).package, '');
        });
    });

    describe('subs', function () {
        it('finds a sub and its line range', function () {
            const doc = parse('sub greet {\n    return 1;\n}\n');
            const element = only(doc.elements.get('greet'));
            assert.strictEqual(element.type, PerlSymbolKind.LocalSub);
            assert.strictEqual(element.line, 0);
            assert.strictEqual(element.lineEnd, 2);
        });
    });

    describe('local variables', function () {
        it('finds a simple my declaration', function () {
            const doc = parse('sub f {\n    my $x = 5;\n}\n');
            assert.strictEqual(only(doc.elements.get('$x')).type, PerlSymbolKind.LocalVar);
        });

        it('finds every variable in a destructured my declaration', function () {
            const doc = parse('sub f {\n    my ($self, $x, %opts) = @_;\n}\n');
            assert.ok(doc.elements.has('$self'));
            assert.ok(doc.elements.has('$x'));
            assert.ok(doc.elements.has('%opts'));
        });

        it('finds a my declaration nested inside an if condition', function () {
            const doc = parse('sub f {\n    if (my $z = compute()) { }\n}\n');
            assert.ok(doc.elements.has('$z'));
        });

        it('finds a foreach loop variable and its label', function () {
            const doc = parse('LOOP: foreach my $i (@list) {\n    last LOOP;\n}\n');
            assert.ok(doc.elements.has('$i'));
            assert.strictEqual(only(doc.elements.get('LOOP')).type, PerlSymbolKind.Label);
        });
    });

    describe('autoloaded accessors', function () {
        it('finds the $self->{_foo} backing-field idiom for both = and ||=', function () {
            const doc = parse('sub f {\n    $self->{_cache} ||= {};\n    $self->{_other} = 1;\n}\n');
            assert.ok(doc.autoloads.has('get_cache'));
            assert.ok(doc.autoloads.has('get_other'));
        });
    });

    describe('known object types', function () {
        it('types a variable assigned via Foo::Bar->new(...)', function () {
            const doc = parse('my $obj = Foo::Bar->new();\n');
            const element = only(doc.elements.get('$obj'));
            assert.strictEqual(element.typeDetail, 'Foo::Bar');
            assert.strictEqual(doc.canonicalElements.get('$obj')?.typeDetail, 'Foo::Bar');
        });

        it('types a variable assigned via indirect-object new Foo::Bar(...)', function () {
            const doc = parse('my $obj = new Foo::Bar();\n');
            assert.strictEqual(only(doc.elements.get('$obj')).typeDetail, 'Foo::Bar');
        });

        it('does not also create an untyped duplicate entry', function () {
            const doc = parse('my $obj = Foo::Bar->new();\n');
            assert.strictEqual(doc.elements.get('$obj')?.length, 1);
        });
    });

    describe('loadMacros', function () {
        it('collects filenames from a parenthesized, multi-line call', function () {
            const doc = parse("loadMacros(\n    'PGstandard.pl',\n    'PGML.pl'\n);\n");
            assert.deepStrictEqual(doc.loadedMacros, ['PGstandard.pl', 'PGML.pl']);
        });

        it('collects a filename from a bareword call', function () {
            const doc = parse("loadMacros 'PGcourse.pl';\n");
            assert.deepStrictEqual(doc.loadedMacros, ['PGcourse.pl']);
        });
    });
});
