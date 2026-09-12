import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import { Text } from '@codemirror/state';
import { pgLanguage } from '@openwebwork/codemirror-lang-pg';
import { perlLanguage } from 'codemirror-lang-perl';
import type { Tree, TreeCursor, SyntaxNode } from '@lezer/common';
import { type PerlDocument, type PerlElement, PerlSymbolKind, ElementSource } from './types';

export const parseFromUri = async (uri: string): Promise<PerlDocument | undefined> => {
    // File may not exist. Return nothing if it doesn't.
    const absolutePath = URI.parse(uri).fsPath;
    try {
        const content = await fs.promises.readFile(absolutePath, 'utf8');
        const document = TextDocument.create(uri, 'perl', 1, content);
        return parsePerlDocument(document);
    } catch {
        /* Ignore errors */
    }
};

// Parses a .pg problem file with @openwebwork/codemirror-lang-pg.
export const parseDocument = (textDocument: TextDocument): PerlDocument =>
    parseWithGrammar(pgLanguage.parser, textDocument);

// Parses a Perl file with codemirror-lang-perl.
const parsePerlDocument = (textDocument: TextDocument): PerlDocument =>
    parseWithGrammar(perlLanguage.parser, textDocument);

const parseWithGrammar = (parser: { parse: (code: string) => Tree }, textDocument: TextDocument): PerlDocument => {
    const perlDoc: PerlDocument = {
        elements: new Map(),
        canonicalElements: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        uri: textDocument.uri,
        loadedMacros: []
    };

    const code = textDocument.getText();
    const text = Text.of(code.split('\n'));

    // Try/catch isn't understood by the Perl or PG codemirror parsers (both parse it as a nested bareword call). So the
    // catch variable is picked up as plain text instead. This is meaningless for problem files, since try/catch can't
    // be used in a problem file.
    scanForCatchVariables(code, perlDoc);

    const tree = parser.parse(code);
    walkSiblings(tree.topNode, text, code, perlDoc, '');

    return perlDoc;
};

const scanForCatchVariables = (code: string, perlDoc: PerlDocument): void => {
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const match = /^\s*\}?\s*catch\s*\(\s*(\$\w+)\s*\)\s*\{?\s*$/.exec(lines[i]);
        if (match) makeElement(perlDoc, match[1], PerlSymbolKind.LocalVar, '', '', i);
    }
};

// Returns the 0-indexed line number of pos in text.
const lineOf = (pos: number, text: Text): number => text.lineAt(pos).number - 1;

const makeElement = (
    perlDoc: PerlDocument,
    name: string,
    type: PerlSymbolKind,
    typeDetail: string,
    pkg: string,
    line: number,
    lineEnd: number = line
): void => {
    if (!name) return;

    const newElement: PerlElement = {
        name,
        type,
        typeDetail,
        uri: perlDoc.uri,
        package: pkg,
        line,
        lineEnd,
        value: '',
        source: ElementSource.parser
    };

    if (type === PerlSymbolKind.AutoLoadVar) {
        perlDoc.autoloads.set(name, newElement);
        return;
    }

    if (typeDetail.length > 0) perlDoc.canonicalElements.set(name, newElement);

    const array = perlDoc.elements.get(name) ?? [];
    array.push(newElement);
    perlDoc.elements.set(name, array);
};

const isVariableNode = (name: string): boolean =>
    name === 'ScalarVariable' || name === 'ArrayVariable' || name === 'HashVariable';

const SCOPE_KEYWORDS = new Set(['my', 'our', 'local', 'state']);

// Walks a node's direct children in order, threading through the "current package", which only changes for
// subsequent siblings when a semicolon-form `package Foo;` statement is encountered.
const walkSiblings = (node: SyntaxNode, text: Text, code: string, perlDoc: PerlDocument, pkg: string): void => {
    let child = node.firstChild;
    let currentPackage = pkg;
    while (child) {
        currentPackage = handleNode(child, text, code, perlDoc, currentPackage);
        child = child.nextSibling;
    }
};

// Handles one node, and returns the package that should apply to the node's later siblings.
const handleNode = (node: SyntaxNode, text: Text, code: string, perlDoc: PerlDocument, pkg: string): string => {
    switch (node.name) {
        case 'PackageStatement': {
            const nameNode = node.getChild('PackageName');
            const name = nameNode ? code.slice(nameNode.from, nameNode.to) : '';
            const block = node.getChild('Block');
            if (block) {
                makeElement(
                    perlDoc,
                    name,
                    PerlSymbolKind.Package,
                    '',
                    name,
                    lineOf(node.from, text),
                    lineOf(block.to, text)
                );
                // Block-scoped form `package Foo { ... }`. Doesn't leak to siblings of the PackageStatement itself.
                walkSiblings(block, text, code, perlDoc, name);
                return pkg;
            }
            // Semicolon form: package Foo; applies until the next PackageStatement sibling, or the end of the
            // enclosing statement list if there isn't one.
            let next = node.nextSibling;
            while (next && next.name !== 'PackageStatement') next = next.nextSibling;
            const scopeEnd = next ? lineOf(next.from, text) - 1 : lineOf((node.parent ?? node).to, text);
            makeElement(perlDoc, name, PerlSymbolKind.Package, '', name, lineOf(node.from, text), scopeEnd);
            return name;
        }
        case 'FunctionDefinition': {
            const nameNode = node.getChild('FunctionName');
            const name = nameNode ? code.slice(nameNode.from, nameNode.to) : '';
            const block = node.getChild('Block');
            const lineEnd = lineOf((block ?? node).to, text);
            makeElement(perlDoc, name, PerlSymbolKind.LocalSub, '', pkg, lineOf(node.from, text), lineEnd);
            if (block) walkSiblings(block, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'SpecialBlock': {
            const keyword = node.firstChild;
            const name = keyword ? code.slice(keyword.from, keyword.to) : '';
            const block = node.getChild('Block');
            const lineEnd = lineOf((block ?? node).to, text);
            makeElement(perlDoc, name, PerlSymbolKind.Phaser, '', pkg, lineOf(node.from, text), lineEnd);
            if (block) walkSiblings(block, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'ForStatement2': {
            // foreach/for my $x (...) { }, possibly labeled. The loop variable is a direct child, not wrapped in
            // a VariableDeclaration node, so it needs its own handling rather than falling out of the generic case.
            handleLabel(node, text, code, perlDoc, pkg);
            const scopeKeyword = node.getChildren('my').concat(node.getChildren('our')).at(0);
            const loopVar = node.getChild('ScalarVariable');
            if (scopeKeyword && loopVar) {
                makeElement(
                    perlDoc,
                    code.slice(loopVar.from, loopVar.to),
                    PerlSymbolKind.LocalVar,
                    '',
                    pkg,
                    lineOf(node.from, text)
                );
            }
            walkSiblings(node, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'WhileStatement':
        case 'UntilStatement':
        case 'ForStatement1':
        case 'StandaloneBlock': {
            handleLabel(node, text, code, perlDoc, pkg);
            walkSiblings(node, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'VariableDeclaration': {
            handleVariableDeclaration(node, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'Assignment':
        case 'UpdateExpression': {
            handleAutoload(node, text, code, perlDoc, pkg);
            const consumedDecl = handleKnownObj(node, text, code, perlDoc, pkg);
            for (let child = node.firstChild; child; child = child.nextSibling) {
                // SyntaxNode getters return fresh wrapper objects, so compare by position, not reference.
                if (child.from !== consumedDecl?.from) handleNode(child, text, code, perlDoc, pkg);
            }
            return pkg;
        }
        case 'CallExpression': {
            handleMacroLoad(node, code, perlDoc);
            walkSiblings(node, text, code, perlDoc, pkg);
            return pkg;
        }
        case 'UseNoStatement':
        case 'RequireStatement': {
            // PG problem files can't call use, require, or no as they are trapped in the safe compartment.
            // So this only matters when parsing a Perl file.
            handleImport(node, text, code, perlDoc);
            walkSiblings(node, text, code, perlDoc, pkg);
            return pkg;
        }
        default: {
            walkSiblings(node, text, code, perlDoc, pkg);
            return pkg;
        }
    }
};

// The label's range spans the whole labeled loop/block, not just the "LOOP:" token itself.
const handleLabel = (node: SyntaxNode, text: Text, code: string, perlDoc: PerlDocument, pkg: string): void => {
    const label = node.getChild('Label');
    if (!label) return;
    const idNode = label.getChild('Identifier');
    if (!idNode) return;
    const name = code.slice(idNode.from, idNode.to);
    makeElement(perlDoc, name, PerlSymbolKind.Label, '', pkg, lineOf(label.from, text), lineOf(node.to, text));
};

const handleVariableDeclaration = (
    node: SyntaxNode,
    text: Text,
    code: string,
    perlDoc: PerlDocument,
    pkg: string
): void => {
    const line = lineOf(node.from, text);
    let child = node.firstChild?.nextSibling ?? null; // Skip the scope keyword itself.
    while (child) {
        if (isVariableNode(child.name))
            makeElement(perlDoc, code.slice(child.from, child.to), PerlSymbolKind.LocalVar, '', pkg, line);
        child = child.nextSibling;
    }
};

// Parse assignments to hash keys of $self such as `$self->{_foo} = ...;`, `$self->{_foo} ||= ...;`,
// or `$self->{_foo} //= ...;`. These are potential autoload methods.
const handleAutoload = (node: SyntaxNode, text: Text, code: string, perlDoc: PerlDocument, pkg: string): void => {
    const lhs = node.firstChild;
    if (!lhs) return;
    if (lhs.name !== 'HashAccessVariable') return;

    const scalarVar = lhs.firstChild;
    if (!scalarVar) return;
    if (scalarVar.name !== 'ScalarVariable') return;
    if (code.slice(scalarVar.from, scalarVar.to) !== '$self') return;

    const keyNode =
        lhs.getChild('Identifier') ?? lhs.getChild('StringSingleQuoted') ?? lhs.getChild('StringDoubleQuoted');
    if (!keyNode) return;

    const key = code.slice(keyNode.from, keyNode.to).replace(/^['"]|['"]$/g, '');
    if (!key.startsWith('_')) return;

    makeElement(perlDoc, 'get_' + key.slice(1), PerlSymbolKind.AutoLoadVar, '', pkg, lineOf(node.from, text));
};

// Find assignments such as `my $x = Foo::Bar->new(...);` or `my $x = new Foo::Bar(...);` and gives $x a known type for
// completion or hover.  Returns the VariableDeclaration node it consumed, so the caller can skip the generic handling.
const handleKnownObj = (
    node: SyntaxNode,
    text: Text,
    code: string,
    perlDoc: PerlDocument,
    pkg: string
): SyntaxNode | undefined => {
    if (node.name !== 'Assignment') return;

    const decl = node.firstChild;
    if (!decl) return;
    if (decl.name !== 'VariableDeclaration') return;

    const scopeKeyword = decl.firstChild;
    if (!scopeKeyword || !SCOPE_KEYWORDS.has(code.slice(scopeKeyword.from, scopeKeyword.to))) return;

    const varNode = decl.getChild('ScalarVariable');
    if (!varNode) return;

    // decl, "=", rhs
    const rhs = decl.nextSibling?.nextSibling;
    if (!rhs) return;

    let constructorPackage: string | undefined;
    if (rhs.name === 'MethodInvocation' || rhs.name === 'IndirectMethodInvocation') {
        const packageNode = rhs.getChild('PackageName');
        const functionNode = rhs.getChild('FunctionName');
        if (packageNode && functionNode && code.slice(functionNode.from, functionNode.to) === 'new') {
            constructorPackage = code.slice(packageNode.from, packageNode.to);
        }
    }
    if (!constructorPackage) return;

    const varName = code.slice(varNode.from, varNode.to);
    makeElement(perlDoc, varName, PerlSymbolKind.LocalVar, constructorPackage, pkg, lineOf(node.from, text));
    return decl;
};

const stringLiteralValue = (node: SyntaxNode, code: string): string | undefined => {
    if (node.name !== 'StringSingleQuoted' && node.name !== 'StringDoubleQuoted') return;
    const interpolated = node.getChild('InterpolatedStringContent');
    if (interpolated) return code.slice(interpolated.from, interpolated.to);
    // A plain single-quoted string with no interpolation has no dedicated content child.
    return code.slice(node.from, node.to).slice(1, -1);
};

const handleImport = (node: SyntaxNode, text: Text, code: string, perlDoc: PerlDocument): void => {
    const packageNode = node.getChild('PackageName');
    if (!packageNode) return;
    perlDoc.imported.set(code.slice(packageNode.from, packageNode.to), lineOf(node.from, text));
};

// Parse a loadMacros(...) call and extract the arguments.
const handleMacroLoad = (node: SyntaxNode, code: string, perlDoc: PerlDocument): void => {
    const functionNode = node.getChild('FunctionName');
    if (!functionNode) return;
    if (code.slice(functionNode.from, functionNode.to) !== 'loadMacros') return;

    const argsContainer = node.getChild('ParenthesizedArguments') ?? node.getChild('Arguments');
    if (!argsContainer) return;
    for (const stringNode of [
        ...argsContainer.getChildren('StringSingleQuoted'),
        ...argsContainer.getChildren('StringDoubleQuoted')
    ]) {
        const value = stringLiteralValue(stringNode, code);
        if (value) (perlDoc.loadedMacros ??= []).push(value);
    }
};

// Debug helper for discovering tree shapes -- not called by default.
export const renderTree = (cursor: TreeCursor, text: Text, code: string, indent = ''): void => {
    const { name, from, to } = cursor;
    const line = text.lineAt(from);
    const column = (from - line.from).toString();
    const snippet = JSON.stringify(code.slice(from, Math.min(to, from + 80)));
    console.log(`${indent}${name} [${line.number.toString()}:${column}] ${snippet}`);
    if (cursor.firstChild()) {
        do {
            renderTree(cursor, text, code, indent + '  ');
        } while (cursor.nextSibling());
        cursor.parent();
    }
};
