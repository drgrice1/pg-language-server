import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import type { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { promisify } from 'util';
import { promises } from 'fs';
import type { PerlDocument, PerlElement, PGLanguageServerSettings } from './types';
import { PerlSymbolKind, ElementSource } from './types';

export const async_execFile = promisify(execFile);

// In production __dirname will be the dist directory.  Otherwise it is the server/src directory.
export const getProjectRoot = (): string =>
    join(process.env.NODE_ENV === 'production' ? dirname(__dirname) : dirname(dirname(__dirname)));

export const getPerlAssetsPath = (): string => join(getProjectRoot(), 'server', 'src', 'perl');

export const getIncPaths = (
    workspaceFolder: WorkspaceFolder | undefined,
    settings: PGLanguageServerSettings
): string[] => {
    let includePaths: string[] = [];

    for (const path of settings.includePaths ?? []) {
        if (path.includes('$workspaceFolder')) {
            if (workspaceFolder) {
                const incPath = URI.parse(workspaceFolder.uri).fsPath;
                includePaths = includePaths.concat(['-I', path.replaceAll('$workspaceFolder', incPath)]);
            } else {
                nLog(
                    `You used $workspaceFolder in your config, but didn't add any workspace folders. Skipping ${path}`,
                    settings
                );
            }
        } else {
            includePaths = includePaths.concat(['-I', path]);
        }
    }

    return includePaths;
};

export const getSymbol = (position: Position, txtDoc: TextDocument): string => {
    // Gets symbol from text at position.
    // Ignore :: going left, but stop at :: when going to the right.
    // (e.g Foo::bar::baz should be clickable on each spot)
    // Todo: Only allow -> once.
    // Used for navigation and hover.

    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);

    const leftRg = /[\p{L}\p{N}_:>-]/u;
    const rightRg = /[\p{L}\p{N}_]/u;

    const leftAllow = (c: string) => leftRg.exec(c);
    const rightAllow = (c: string) => rightRg.exec(c);

    let left = index - 1;
    let right = index;

    if (right < text.length && (['$', '%', '@'].includes(text[right]) || rightAllow(text[right]))) {
        // Handles an edge case where the cursor is on the side of a symbol.
        // Note that $foo| should find $foo (where | represents cursor),
        // but $foo|$bar should find $bar, and |mysub should find mysub
        right += 1;
        left += 1;
    }

    while (left >= 0 && leftAllow(text[left])) {
        // Allow for ->, but not => or > (e.g. $foo->bar, but not $foo=>bar or $foo>bar)
        if (text[left] === '>' && left - 1 >= 0 && text[left - 1] !== '-') {
            break;
        }
        left -= 1;
    }
    left = Math.max(0, left + 1);
    while (right < text.length && rightAllow(text[right])) {
        right += 1;
    }
    right = Math.max(left, right);

    let symbol = text.substring(left, right);
    const prefix = text.substring(0, left);

    const lChar = left > 0 ? text[left - 1] : '';
    const llChar = left > 1 ? text[left - 2] : '';
    const rChar = right < text.length ? text[right] : '';

    if (lChar === '$') {
        if (rChar === '[' && llChar != '$') {
            symbol = '@' + symbol; // $foo[1] -> @foo  $$foo[1] -> $foo
        } else if (rChar === '{' && llChar != '$') {
            symbol = '%' + symbol; // $foo{1} -> %foo   $$foo{1} -> $foo
        } else {
            symbol = '$' + symbol; //  $foo  $foo->[1]  $foo->{1} -> $foo
        }
    } else if (['@', '%'].includes(lChar)) {
        symbol = lChar + symbol; // @foo, %foo -> @foo, %foo
    } else if (lChar === '{' && rChar === '}' && ['$', '%', '@'].includes(llChar)) {
        symbol = llChar + symbol; // ${foo} -> $foo
    }

    let match;
    if (/^->\w+$/.exec(symbol)) {
        // If you have Foo::Bar->new(...)->func, the extracted symbol will be ->func
        // We can special case this to Foo::Bar->func. The regex allows arguments to new(),
        // including params with matched ()
        const match = /(\w(?:\w|::\w)*)->new\((?:\([^()]*\)|[^()])*\)$/.exec(prefix);

        if (match) symbol = match[1] + symbol;
    } else if ((match = /^(\w(?:\w|::\w)*)->new->(\w+)$/.exec(symbol))) {
        // If you have Foo::Bar->new->func, the extracted symbol will be Foo::Bar->new->func
        symbol = match[1] + '->' + match[2];
    }

    return symbol;
};

const findRecent = (found: PerlElement[], line: number): PerlElement => {
    let best = found[0];
    for (const item of found) {
        // TODO: is this flawed because not all lookups are in the same file?
        // Find the most recently declared variable. Modules and Packages are both declared at line 0,
        // so Package is tiebreaker (better navigation; modules can be faked by Moose)
        if (
            (item.line > best.line && item.line <= line) ||
            (item.line == best.line && item.type == PerlSymbolKind.Package)
        ) {
            best = item;
        }
    }
    return best;
};

export const lookupSymbol = (
    perlDoc: PerlDocument,
    modMap: Map<string, string>,
    symbol: string,
    line: number
): PerlElement[] => {
    let found = perlDoc.elements.get(symbol);
    if (found?.length) {
        // Simple lookup worked. If we have multiple (e.g. 2 lexical variables), find the nearest earlier declaration.
        const best = findRecent(found, line);
        return [best];
    }

    const foundMod = modMap.get(symbol);
    if (foundMod) {
        // Ideally we would've found the module in the PerlDoc, but perhaps it was "required" instead of "use'd"
        return [
            {
                name: symbol,
                type: PerlSymbolKind.Module,
                typeDetail: '',
                uri: URI.parse(foundMod).toString(),
                package: symbol,
                line: 0,
                lineEnd: 0,
                value: '',
                source: ElementSource.modHunter
            }
        ];
    }

    let qSymbol = symbol;

    const superClass = /^(\$\w+)->SUPER\b/.exec(symbol);
    if (superClass) {
        // If looking up the superclass of $self->SUPER, we need to find the package
        // in which $self is defined, and then find the parent
        const child = perlDoc.elements.get(superClass[1]);
        if (child?.length) {
            const recentChild = findRecent(child, line);
            if (recentChild.package) {
                const parentVar = perlDoc.parents.get(recentChild.package);
                if (parentVar) {
                    qSymbol = qSymbol.replace(/^\$\w+->SUPER/, parentVar);
                }
            }
        }
    }

    const knownObject = /^(\$\w+)->(?:\w+)$/.exec(symbol);
    if (knownObject) {
        const targetVar = perlDoc.canonicalElements.get(knownObject[1]);
        if (targetVar) qSymbol = qSymbol.replace(/^\$\w+(?=->)/, targetVar.typeDetail);
    }

    // Add what we mean when someone wants ->new().
    const synonyms = ['_init', 'BUILD'];
    for (const synonym of synonyms) {
        found = perlDoc.elements.get(symbol.replace(/->new$/, '::' + synonym));
        if (found?.length) return [found[0]];
    }
    found = perlDoc.elements.get(symbol.replace(/DBI->new$/, 'DBI::connect'));
    if (found?.length) return [found[0]];

    qSymbol = qSymbol.replaceAll('->', '::'); // Module->method() can be found via Module::method
    qSymbol = qSymbol.replace(/^main::(\w+)$/g, '$1'); // main::foo is just tagged as foo

    found = perlDoc.elements.get(qSymbol);
    if (found?.length) return [found[0]];

    if (qSymbol.includes('::') && symbol.includes('->')) {
        // Launching to the wrong explicitly stated module is a bad experience, and common with "require'd" modules
        const method = qSymbol.split('::').pop();
        if (method) {
            // Perhaps the method is within our current scope, explictly imported,
            // or an inherited method (dumper by Inquisitor)
            found = perlDoc.elements.get(method);
            if (found?.length) return [found[0]];

            // Autoloaded are lower priority than inherited, but higher than random hunting
            const foundAuto = perlDoc.autoloads.get(method);
            if (foundAuto) return [foundAuto];

            // Haven't found the method yet, let's check if anything could be a
            // possible match since you don't know the object type
            const foundElements: PerlElement[] = [];
            for (const [elementName, elements] of perlDoc.elements) {
                const element = elements[0]; // All Elements are with same name are normally the same.
                const elementMethod = elementName.split('::').pop();
                if (elementMethod == method) {
                    foundElements.push(element);
                }
            }
            if (foundElements.length > 0) return foundElements;
        }
    }

    if (/^(\w(?:\w|::\w)*)$/.exec(symbol)) {
        // Running out of options here. Perhaps it's a Package, and the
        // file is in the symbol table under its individual functions.

        for (const potentialElement of perlDoc.elements.values()) {
            const element = potentialElement[0]; // All Elements are with same name are normally the same.
            if (element.package && element.package == symbol) {
                // Just return the first one. The others would likely be the same
                return [
                    {
                        name: symbol,
                        type: PerlSymbolKind.Package,
                        typeDetail: '',
                        uri: element.uri,
                        package: symbol,
                        line: 0,
                        lineEnd: 0,
                        value: '',
                        source: ElementSource.packageInference
                    }
                ];
            }
        }
    }

    return [];
};

export const nLog = (message: string, settings: PGLanguageServerSettings): void => {
    // TODO: Remove resource level settings and just use a global logging setting?
    if (settings.logging) console.error(message);
};

export const isFile = async (file: string): Promise<boolean> => {
    try {
        const stats = await promises.stat(file);
        return stats.isFile();
    } catch {
        // File or directory doesn't exist
        return false;
    }
};
