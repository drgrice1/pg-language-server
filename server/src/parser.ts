import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import * as fs from 'fs';
import * as path from 'path';
import { type PerlDocument, type PerlElem, PerlSymbolKind, ParseType, TagKind, ElemSource } from './types';

const init_doc = (textDocument: TextDocument): PerlDocument => {
    return {
        elems: new Map(),
        canonicalElems: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        uri: textDocument.uri
    };
};

interface ParserState {
    stmt: string;
    line_number: number;
    var_continues: boolean;
    package_name: string;
    uri: string;
    perlDoc: PerlDocument;
    parseType: ParseType;
    codeArray: string[];
}

type ParseFunc = (state: ParserState) => boolean;

export const parseFromUri = async (uri: string, parseType: ParseType): Promise<PerlDocument | undefined> => {
    // File may not exists. Return nothing if it doesn't
    const absolutePath = URI.parse(uri).fsPath;
    try {
        const content = await fs.promises.readFile(absolutePath, 'utf8');
        const document = TextDocument.create(uri, 'perl', 1, content);
        return await parseDocument(document, parseType);
    } catch {
        /* Ignore errors */
    }
};

export const parseDocument = async (textDocument: TextDocument, parseType: ParseType): Promise<PerlDocument> => {
    let parseFunctions: ParseFunc[] = [];
    switch (parseType) {
        case ParseType.outline:
            parseFunctions = [subs, labels, imports];
            break;
        case ParseType.selfNavigation:
            parseFunctions = [knownObj, localVars, subs, labels, imports, autoloads];
            break;
        case ParseType.refinement:
            parseFunctions = [subs];
            break;
    }

    parseFunctions.unshift(packages); // Packages always need to be found to be able to categorize the elements.

    const perlDoc = init_doc(textDocument);

    const state: ParserState = {
        stmt: '',
        line_number: 0,
        package_name: '',
        perlDoc: perlDoc,
        uri: textDocument.uri,
        var_continues: false,
        codeArray: await cleanCode(textDocument, perlDoc, parseType),
        parseType: parseType
    };

    for (state.line_number = 0; state.line_number < state.codeArray.length; ++state.line_number) {
        state.stmt = state.codeArray[state.line_number];
        // Nothing left? Never mind.
        if (!state.stmt) continue;

        parseFunctions.some((fn) => fn(state));
    }
    return perlDoc;
};

const knownObj = (state: ParserState): boolean => {
    let match;

    // TODO, allow specifying list of constructor names as config
    // Declaring an object. Let's store the type
    // my $constructors = qr/(?:new|connect)/;
    if (
        (match = /^(?:my|our|local|state)\s+(\$\w+)\s*=\s*([\w:]+)->new\s*(?:\((?!.*\)->)|;)/.exec(state.stmt)) ||
        (match = /^(?:my|our|local|state)\s+(\$\w+)\s*=\s*new (\w[\w:]+)\s*(?:\((?!.*\)->)|;)/.exec(state.stmt))
    ) {
        const varName = match[1];
        const objName = match[2];
        MakeElem(varName, PerlSymbolKind.LocalVar, objName, state);

        state.var_continues = false; // We skipped ahead of the line here. Why though?
        return true;
    } else {
        return false;
    }
};

const localVars = (state: ParserState): boolean => {
    // This is a variable declaration if one was started on the previous
    // line, or if this line starts with my or local
    let match;
    if (state.var_continues || (match = /^(?:my|our|local|state)\b/.exec(state.stmt))) {
        // The declaration continues unless there's a semicolon, signature end, or sub start.
        // This can get tripped up with comments, but it's not a huge deal. subroutines are more important
        state.var_continues = !/[)=}{;]/.exec(state.stmt);

        let mod_stmt = state.stmt;
        // Remove my or local from statement, if present
        mod_stmt = mod_stmt.replace(/^(my|our|local|state)\s+/, '');

        // Remove any assignment piece. Breaks with signature defaults
        mod_stmt = mod_stmt.replace(/\s*=.*/, '');

        // Remove part where sub starts (for signatures), while exempting default {} args
        mod_stmt = mod_stmt.replace(/\s*(\{[^}]|\)).*/, '');

        // Now find all variable names, i.e. "words" preceded by $, @ or %
        const vars = mod_stmt.matchAll(/([$@%][\w:]+)\b/g);

        for (const match of vars) MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
        return true;
        // Lexical loop variables, potentially with labels in front. foreach my $foo
    } else if ((match = /^(?:(\w+)\s*:(?!:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/.exec(state.stmt))) {
        if (match[1]) MakeElem(match[1], PerlSymbolKind.Label, '', state);
        MakeElem(match[2], PerlSymbolKind.LocalVar, '', state);
        // Lexical match variables if(my ($foo, $bar) ~= ).
        // Optional to detect (my $newstring = $oldstring) =~ s/foo/bar/g;
    } else if ((match = /^(?:\}\s*elsif|if|unless|while|until|for)?\s*\(\s*my\b(.*)$/.exec(state.stmt))) {
        // Remove any assignment piece
        const mod_stmt = state.stmt.replace(/\s*=.*/, '');
        const vars = mod_stmt.matchAll(/([$@%][\w]+)\b/g);
        for (const match of vars) MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
        // Try-catch exception variables
    } else if ((match = /^\}?\s*catch\s*\(\s*(\$\w+)\s*\)\s*\{?$/.exec(state.stmt))) {
        MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
    } else {
        return false;
    }

    return true;
};

const packages = (state: ParserState): boolean => {
    const match = /^package\s+([\w:]+)/.exec(state.stmt);
    if (!match) return false;

    // Get name of the package
    state.package_name = match[1];
    MakeElem(state.package_name, PerlSymbolKind.Package, '', state, packageEndLine(state));
    return true;
};

const subs = (state: ParserState): boolean => {
    const match = /^(sub)\s+([\w:]+)([^{]*)/.exec(state.stmt);
    if (!match) return false;
    MakeElem(match[2], PerlSymbolKind.LocalSub, '', state, subEndLine(state));
    return true;
};

const labels = (state: ParserState): boolean => {
    let match;
    if ((match = /^(BEGIN|INIT|CHECK|UNITCHECK|END)\s*\{/.exec(state.stmt))) {
        // Phaser block
        MakeElem(match[1], PerlSymbolKind.Phaser, '', state, subEndLine(state));
    } else if ((match = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:[^:].*{\s*$/.exec(state.stmt))) {
        // Label line
        MakeElem(match[1], PerlSymbolKind.Label, '', state, subEndLine(state));
    } else {
        return false;
    }

    return true;
};

const imports = (state: ParserState): boolean => {
    const match = /^use\s+([\w:]+)\b/.exec(state.stmt);
    if (!match) return false;

    // Keep track of explicit imports for filtering
    const importPkg = match[1];
    MakeElem(importPkg, TagKind.UseStatement, '', state);
    return true;
};

const autoloads = (state: ParserState): boolean => {
    const match = /^\$self->\{\s*(['"]|)_(\w+)\1\s*\}\s*(?:\|\||\/\/)?=/.exec(state.stmt);
    if (!match) return false;

    // Common paradigm is for autoloaders to basically just point to the class variable
    const variable = match[2];
    MakeElem('get_' + variable, PerlSymbolKind.AutoLoadVar, '', state);
    return true;
};

const translateLine = (line: string): string => {
    return line
        .replace(/\r$/, '')
        .replace(/^\s*END_TEXT[\s;]*$/, 'END_TEXT')
        .replace(/^\s*END_PGML[\s;]*$/, 'END_PGML')
        .replace(/^\s*END_PGML_SOLUTION[\s;]*$/, 'END_PGML_SOLUTION')
        .replace(/^\s*END_PGML_HINT[\s;]*$/, 'END_PGML_HINT')
        .replace(/^\s*END_SOLUTION[\s;]*$/, 'END_SOLUTION')
        .replace(/^\s*END_HINT[\s;]*$/, 'END_HINT')
        .replace(/^\s*BEGIN_TEXT[\s;]*$/, "STATEMENT(EV3P(<<'END_TEXT'));")
        .replace(/^\s*BEGIN_PGML[\s;]*$/, "STATEMENT(PGML::Format2(<<'END_PGML'));")
        .replace(/^\s*BEGIN_PGML_SOLUTION[\s;]*$/, "SOLUTION(PGML::Format2(<<'END_PGML_SOLUTION'));")
        .replace(/^\s*BEGIN_PGML_HINT[\s;]*$/, "HINT(PGML::Format2(<<'END_PGML_HINT'));")
        .replace(/^\s*BEGIN_SOLUTION[\s;]*$/, "SOLUTION(EV3P(<<'END_SOLUTION'));")
        .replace(/^\s*BEGIN_HINT[\s;]*$/, "HINT(EV3P(<<'END_HINT'));")
        .replace(/^\s*(.*)\s*->\s*BEGIN_TIKZ[\s;]*$/, '$1->tex(<<END_TIKZ);')
        .replace(/^\s*END_TIKZ[\s;]*$/, 'END_TIKZ')
        .replace(/^\s*(.*)\s*->\s*BEGIN_LATEX_IMAGE[\s;]*$/, '$1->tex(<<END_LATEX_IMAGE);')
        .replace(/^\s*END_LATEX_IMAGE[\s;]*$/, 'END_LATEX_IMAGE')
        .replace(/ENDDOCUMENT.*/, 'ENDDOCUMENT();')
        .replaceAll('\\', '\\\\')
        .replaceAll('~~', '\\');
};

const cleanCode = async (
    textDocument: TextDocument,
    perlDoc: PerlDocument,
    parseType: ParseType
): Promise<string[]> => {
    const code = textDocument.getText();

    const codeArray = code.split('\n').map(translateLine);
    const endDocumentLocation = codeArray.findIndex((t) => t.includes('ENDDOCUMENT'));
    if (endDocumentLocation !== -1) codeArray.splice(endDocumentLocation + 1);

    let codeClean = [];

    const commentState: ParserState = {
        stmt: '',
        line_number: 0,
        package_name: '',
        perlDoc: perlDoc,
        uri: textDocument.uri,
        var_continues: false,
        codeArray: codeArray,
        parseType: parseType
    };

    for (commentState.line_number = 0; commentState.line_number < codeArray.length; ++commentState.line_number) {
        commentState.stmt = codeArray[commentState.line_number];

        let match;
        if (parseType == ParseType.selfNavigation && (match = /#.*(\$\w+) isa ([\w:]+)\b/.exec(commentState.stmt))) {
            const pvar = match[1];
            const typeName = match[2];
            // TODO: Do I need a file or package here? Canonical variables are weird
            MakeElem(pvar, PerlSymbolKind.Canonical, typeName, commentState);
        }

        let mod_stmt = commentState.stmt;
        mod_stmt = mod_stmt.replace(/^\s*/, '');
        mod_stmt = mod_stmt.replace(/\s*$/, '');

        codeClean.push(mod_stmt);
    }

    // If only doing shallow parsing, we don't need to strip {} or find start-end points of subs
    if (parseType == ParseType.outline) codeClean = await stripCommentsAndQuotes(codeClean);

    return codeClean;
};

const MakeElem = (
    name: string,
    type: PerlSymbolKind | TagKind,
    typeDetail: string,
    state: ParserState,
    lineEnd = 0,
    signature?: string[]
): void => {
    if (!name) return; // Don't store empty names (shouldn't happen)

    if (lineEnd == 0) lineEnd = state.line_number;

    if (type == TagKind.UseStatement) {
        // Explictly loaded module. Helpful for focusing autocomplete results
        state.perlDoc.imported.set(name, state.line_number);
        // TODO: Build mapping of common constructors to types
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true);
        return; // Don't store it as an element
    }

    if (type == TagKind.Canonical2) {
        state.perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    }

    const newElem: PerlElem = {
        name: name,
        type: type,
        typeDetail: typeDetail,
        uri: state.uri,
        package: state.package_name,
        line: state.line_number,
        lineEnd: lineEnd,
        value: '',
        source: ElemSource.parser
    };

    if (type == PerlSymbolKind.AutoLoadVar) {
        state.perlDoc.autoloads.set(name, newElem);
        return; // Don't store it as an element
    }

    if (signature && signature.length > 0) newElem.signature = signature;

    if (typeDetail.length > 0) {
        // TODO: The canonicalElems don't need to be PerlElems, they might be just a string.
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        state.perlDoc.canonicalElems.set(name, newElem);
        // This object is only intended as the canonicalLookup, not for anything else.
        if (type == PerlSymbolKind.Canonical) return;
    }

    const array = state.perlDoc.elems.get(name) ?? [];
    array.push(newElem);
    state.perlDoc.elems.set(name, array);

    return;
};

const subEndLine = (state: ParserState, rFilter: RegExp | null = null): number => {
    if (state.parseType != ParseType.outline) return state.line_number;

    let pos = 0;
    let found = false;

    for (let i = state.line_number; i < state.codeArray.length; i++) {
        // Perhaps limit the max depth?
        let stmt = state.codeArray[i];

        if (i == state.line_number) {
            if (rFilter) stmt = stmt.replace(rFilter, '');
            // Default argument of empty hash. Other types of hashes may still trip this up
            stmt = stmt.replace(/\$\w+\s*=\s*\{\s*\}/, '');
            // "Forward" declaration, such as `sub foo;`
            if (/;\s*$/.exec(stmt)) return i;
        }

        for (const char of stmt.split('')) {
            if (char == '{') {
                // You may just be finding default function args = {}
                found = true;
                pos++;
            } else if (char == '}') {
                pos--;
            }
        }
        //  Checking outside the statement is faster, but less accurate
        if (found && pos == 0) return i;
    }
    return state.line_number;
};

const packageEndLine = (state: ParserState): number => {
    if (state.parseType != ParseType.outline) {
        return state.line_number;
    }

    let start_line = state.line_number;
    if (/(class|package)[^#]+;/.exec(state.codeArray[start_line])) {
        // Single line package definition.
        if (/{.*(class|package)/.exec(state.codeArray[start_line])) {
            // Will need to hunt for the end
        } else if (start_line > 0 && /\{[^}]*$/.exec(state.codeArray[start_line - 1])) {
            start_line -= 1;
        }
    }

    let pos = 0;
    let found = false;

    for (let i = start_line; i < state.codeArray.length; i++) {
        // Perhaps limit the max depth?
        const stmt = state.codeArray[i];
        for (const char of stmt.split('')) {
            if (char == '{') {
                found = true;
                pos++;
            } else if (char == '}') {
                pos--;
            }
        }

        if (!found) {
            // If we haven't found the start of the package block, there probably isn't one.
            if (stmt.includes(';') || i - start_line > 1) {
                break;
            }
        }

        // Checking outside the for loop is faster, but less accurate.
        if (found && pos == 0) return i;
    }

    for (let i = start_line + 1; i < state.codeArray.length; i++) {
        // TODO: update with class inheritance / version numbers, etc
        // Although should we do with nested packages/classes? (e.g. Pack A -> Pack B {} -> A)
        if (/^\s*(class|package)\s+([\w:]+)/.exec(state.codeArray[i])) return i - 1;
    }

    // If we didn't find an end, run until end of file
    return state.codeArray.length;
};

const wasmBin = fs.readFileSync(path.join(__dirname, './../node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
        createOnigScanner(patterns: string[]) {
            return new oniguruma.OnigScanner(patterns);
        },
        createOnigString(s: string) {
            return new oniguruma.OnigString(s);
        }
    };
});

const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: async () => {
        const grammarpath = path.join(__dirname, './../perl.tmLanguage.json');
        const grammar = await fs.promises.readFile(grammarpath, 'utf8');
        return vsctm.parseRawGrammar(grammar, grammarpath);
    }
});

const stripCommentsAndQuotes = async (code: string[]): Promise<string[]> => {
    const grammar = await registry.loadGrammar('source.perl');
    if (!grammar) throw new Error("Couldn't load Textmate grammar");

    let ruleStack: vsctm.StateStack | null = vsctm.INITIAL;
    const codeStripped = [];

    for (const line of code) {
        const result = grammar.tokenizeLine(line, ruleStack);
        ruleStack = result.ruleStack;
        let strippedCode = '';

        let lastEndIndex = 0;
        for (const token of result.tokens) {
            const content = line.substring(lastEndIndex, token.endIndex);
            lastEndIndex = token.endIndex;

            // This includes regexes and pod too
            const isComment = token.scopes.some((scope) => scope.startsWith('comment'));

            if (isComment) {
                // Remove all comments
                continue;
            }

            const isString = token.scopes.some((scope) => scope.startsWith('string'));
            const isPunc = token.scopes.some((scope) => scope.startsWith('punctuation'));

            if (isString && !isPunc) {
                if (strippedCode == '') {
                    // The 2nd-Nth lines of multi-line strings should be stripped
                    strippedCode += '___';
                    continue;
                } else if (/[{}]/.exec(content)) {
                    // In-line strings that contains {} need to be stripped regardless of position
                    continue;
                }
            }
            strippedCode += content;
        }
        codeStripped.push(strippedCode);
    }

    return codeStripped;
};
