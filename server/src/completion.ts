import {
    type TextDocumentPositionParams,
    type CompletionItem,
    CompletionItemKind,
    type Range,
    type MarkupContent
} from 'vscode-languageserver/node';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PerlDocument, PerlElement, CompletionPrefix, completionElement } from './types';
import { PerlSymbolKind, ElementSource } from './types';
import { getPod } from './pod';
import { URI } from 'vscode-uri';

export const getCompletions = (
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument,
    txtDoc: TextDocument,
    modMap: Map<string, string>
): CompletionItem[] => {
    const position = params.position;
    const start = { line: position.line, character: 0 };
    const text = txtDoc.getText({ start, end: { line: position.line + 1, character: 0 } });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);

    const importPrefix = getImportPrefix(text, index);
    if (importPrefix) {
        return getImportMatches(
            modMap,
            importPrefix.symbol,
            {
                start: { line: position.line, character: importPrefix.charStart },
                end: { line: position.line, character: importPrefix.charEnd }
            },
            perlDoc
        );
    } else {
        const prefix = getPrefix(text, index);
        if (!prefix.symbol) return [];

        return getMatches(
            perlDoc,
            prefix.symbol,
            {
                start: { line: position.line, character: prefix.charStart },
                end: { line: position.line, character: prefix.charEnd }
            },
            prefix.stripPackage
        );
    }
};

export const getCompletionDoc = async (
    element: PerlElement,
    perlDoc: PerlDocument,
    modMap: Map<string, string>
): Promise<string | undefined> => {
    const docs = await getPod(element, perlDoc, modMap);
    return docs;
};

// Similar to getSymbol for navigation, but don't "move right".
const getPrefix = (text: string, position: number): CompletionPrefix => {
    const canShift = (c: string) => /[\w:>-]/.exec(c);
    let l = position - 1; // left
    for (; l >= 0 && canShift(text[l]); --l);

    if (l < 0 || (text[l] != '$' && text[l] != '@' && text[l] != '%')) ++l;

    let symbol = text.substring(l, position);
    const prefix = text.substring(0, l);
    let stripPackage = false;
    if (/^-(?:>\w*)?$/.exec(symbol)) {
        // Matches -  or -> or ->\w
        // If you have Foo::Bar->new(...)->func, the extracted symbol will be ->func
        // We can special case this to Foo::Bar->func. The regex allows arguments to new(),
        // including params with matched ()
        const match = /(\w(?:\w|::\w)*)->new\((?:\([^()]*\)|[^()])*\)$/.exec(prefix);

        if (match) {
            symbol = match[1] + symbol;
            stripPackage = true;
        }
    }

    return { symbol: symbol, charStart: l, charEnd: position, stripPackage: stripPackage };
};

// First we check if it's an import statement, which is a special type of autocomplete with far more options
const getImportPrefix = (text: string, position: number): CompletionPrefix | undefined => {
    const partialImport = /^\s*(?:use|require)\s+([\w:]+)$/.exec(text.substring(0, position));
    if (!partialImport) return;
    return {
        symbol: partialImport[1],
        charStart: position - partialImport[1].length,
        charEnd: position,
        stripPackage: false
    };
};

const getImportMatches = (
    modMap: Map<string, string>,
    symbol: string,
    replace: Range,
    perlDoc: PerlDocument
): CompletionItem[] => {
    const matches: CompletionItem[] = [];

    const lcSymbol = symbol.toLowerCase();
    for (const [mod, modFile] of modMap) {
        if (mod.toLowerCase().startsWith(lcSymbol)) {
            matches.push({
                label: mod,
                textEdit: { newText: mod, range: replace },
                kind: CompletionItemKind.Module,
                data: {
                    perlElement: {
                        name: symbol,
                        type: PerlSymbolKind.Module,
                        typeDetail: '',
                        uri: URI.parse(modFile).toString(),
                        package: symbol,
                        line: 0,
                        lineEnd: 0,
                        value: '',
                        source: ElementSource.modHunter
                    },
                    docUri: perlDoc.uri
                }
            });
        }
    }
    return matches;
};

const getMatches = (perlDoc: PerlDocument, symbol: string, replace: Range, stripPackage: boolean): CompletionItem[] => {
    let matches: CompletionItem[] = [];

    let qualifiedSymbol = symbol.replaceAll('->', '::'); // Module->method() can be found via Module::method
    if (qualifiedSymbol.endsWith('-')) qualifiedSymbol = qualifiedSymbol.replace('-', ':');

    let bKnownObj = false;
    // Check if we know the type of this object
    const knownObject = /^(\$\w+):(?::\w*)?$/.exec(qualifiedSymbol);
    if (knownObject) {
        const targetVar = perlDoc.canonicalElements.get(knownObject[1]);
        if (targetVar) {
            qualifiedSymbol = qualifiedSymbol.replace(/^\$\w+(?=:)/, targetVar.typeDetail);
            bKnownObj = true;
        }
    }

    // If the magic variable $self->, then autocomplete to everything in main.
    const bSelf = /^(\$self):(?::\w*)?$/.exec(qualifiedSymbol);
    if (bSelf) bKnownObj = true;

    // Case insensitive matches are hard since we restore what you originally matched on
    // const lcQualifiedSymbol = qualifiedSymbol.toLowerCase();

    for (const [elementName, elements] of perlDoc.elements) {
        // Remove single character magic perl variables. Mostly clutter the list
        if (/^[$@%].$/.test(elementName)) continue;

        // Get the canonical (typed) element, otherwise just grab the first one.
        const element = perlDoc.canonicalElements.get(elementName) ?? elements[0];

        let qualifiedElementName = elementName;

        // All plain and inherited subroutines should match with $self. We're excluding PerlSymbolKind.ImportedSub here
        // because imports clutter the list, despite perl allowing them called on $self->
        if (
            bSelf &&
            [PerlSymbolKind.LocalSub, PerlSymbolKind.Inherited, PerlSymbolKind.LocalMethod].includes(element.type)
        )
            qualifiedElementName = `$self::${qualifiedElementName}`;

        if (goodMatch(perlDoc, qualifiedElementName, qualifiedSymbol, symbol, bKnownObj)) {
            // Hooray, it's a match!
            // You may have asked for FOO::BAR->BAZ or $qux->BAZ and I found FOO::BAR::BAZ.
            // Let's put back the arrow or variable before sending
            const quotedSymbol = qualifiedSymbol.replaceAll('$', '\\$'); // quotemeta for $self->FOO
            let aligned = qualifiedElementName.replace(new RegExp(`^${quotedSymbol}`, 'gi'), symbol);

            if (symbol.endsWith('-')) aligned = aligned.replaceAll('-:', '->'); // Half-arrows count too

            // Don't send invalid constructs
            // like FOO->BAR::BAZ
            if (/->\w+::/.test(aligned)) continue;
            // FOO->BAR if Bar is not a sub/method.
            if (
                /->\w+$/.test(aligned) &&
                ![
                    PerlSymbolKind.LocalSub,
                    PerlSymbolKind.ImportedSub,
                    PerlSymbolKind.Inherited,
                    PerlSymbolKind.LocalMethod,
                    PerlSymbolKind.Method
                ].includes(element.type)
            )
                continue;
            // FOO::BAR if Bar is a instance method or attribute
            // (I assume them to be instance methods/attributes, not class)
            if (
                !/^\$.*->\w+$/.test(aligned) &&
                [PerlSymbolKind.LocalMethod, PerlSymbolKind.Method].includes(element.type)
            )
                continue;
            if (
                aligned.includes('-:') || // We look things up like this, but don't let them slip through
                (aligned.startsWith('$') && aligned.includes('::', 1))
            )
                // $Foo::Bar, I don't really hunt for these anyway
                continue;
            matches = matches.concat(buildMatches(aligned, element, replace, stripPackage, perlDoc));
        }
    }

    return matches;
};

// TODO: preprocess all "allowed" matches so we don't waste time iterating over them for every autocomplete.
const goodMatch = (
    perlDoc: PerlDocument,
    elementName: string,
    qualifiedSymbol: string,
    origSymbol: string,
    bKnownObj: boolean
): boolean => {
    if (!elementName.startsWith(qualifiedSymbol)) return false;
    // All uppercase methods are generally private or autogenerated and unhelpful
    if (/(?:::|->)[A-Z][A-Z_]+$/.test(elementName)) return false;
    if (bKnownObj) {
        // If this is a known object type, we probably aren't importing the package or building a new one.
        if (/(?:::|->)(?:new|import)$/.test(elementName)) return false;
        // If we known the object type (and variable name is not $self), then exclude the double underscore private
        // variables (rare anyway. single underscore kept, but ranked last in the autocomplete)
        if (origSymbol.startsWith('$') && !origSymbol.startsWith('$self') && /(?:::|->)__\w+$/.test(elementName))
            return false;
        // Otherwise, always autocomplete, even if the module has not been explicitly imported.
        return true;
    }
    // Get the module name to see if it's been imported. Otherwise, don't allow it.
    const modRg = /^(.+)::.*?$/;
    const match = modRg.exec(elementName);
    if (match && !perlDoc.imported.has(match[1])) {
        // TODO: Allow completion on packages/class defined within the file itself
        // (e.g. Foo->new, $foo->new already works)
        // Thing looks like a module, but was not explicitly imported
        return false;
    } else {
        // Thing was either explictly imported or not a module function
        return true;
    }
};

const buildMatches = (
    lookupName: string,
    element: PerlElement,
    range: Range,
    stripPackage: boolean,
    perlDoc: PerlDocument
): CompletionItem[] => {
    let kind: CompletionItemKind | undefined = undefined;
    let detail: string | undefined = undefined;
    let documentation: MarkupContent | undefined = undefined;
    const docs: string[] = [];

    if ([PerlSymbolKind.LocalVar, PerlSymbolKind.ImportedVar, PerlSymbolKind.Canonical].includes(element.type)) {
        if (element.typeDetail.length > 0) {
            kind = CompletionItemKind.Variable;
            detail = `${lookupName}: ${element.typeDetail}`;
        } else if (lookupName == '$self') {
            kind = CompletionItemKind.Variable;
            // element.package can be misleading if you use $self in two different packages in the same module.
            // Get scoped matches will address this
            detail = `${lookupName}: ${element.package}`;
        }
    }
    if (!detail) {
        switch (element.type) {
            case PerlSymbolKind.LocalVar:
                kind = CompletionItemKind.Variable;
                break;
            case PerlSymbolKind.ImportedVar:
                kind = CompletionItemKind.Constant;
                // detail = element.name;
                docs.push(element.name);
                docs.push(`Value: ${element.value}`);
                break;
            case PerlSymbolKind.ImportedHash:
            case PerlSymbolKind.LocalSub:
                // For consistency with the other $self methods. VScode seems to hide documentation if less populated?
                if (lookupName.startsWith('$self-')) docs.push(element.name);
                kind = CompletionItemKind.Function;
                break;
            case PerlSymbolKind.ImportedSub:
            case PerlSymbolKind.Inherited:
            case PerlSymbolKind.Method:
            case PerlSymbolKind.LocalMethod:
                kind = CompletionItemKind.Method;
                docs.push(element.name);
                if (element.typeDetail && element.typeDetail != element.name)
                    docs.push(`\nDefined as:\n  ${element.typeDetail}`);
                break;
            case PerlSymbolKind.Package:
            case PerlSymbolKind.Module:
                kind = CompletionItemKind.Module;
                break;
            case PerlSymbolKind.Label: // Loop labels
                kind = CompletionItemKind.Reference;
                break;
            case PerlSymbolKind.Phaser:
            case PerlSymbolKind.HttpRoute:
            case PerlSymbolKind.OutlineOnlySub:
                return [];
            default: // A sign that something needs fixing. Everything should've been enumerated.
                kind = CompletionItemKind.Property;
                break;
        }
    }
    if (docs.length > 0) documentation = { kind: 'markdown', value: '```\n' + docs.join('\n') + '\n```' };

    const labelsToBuild = [lookupName];

    if (lookupName.endsWith('::new'))
        // Having ->new at the top (- sorts before :) is the more common way to call packages
        // (although you can call it either way).
        labelsToBuild.push(lookupName.replace(/::new$/, '->new'));

    const matches: CompletionItem[] = [];

    for (const label of labelsToBuild) {
        let replaceText = label;
        if (stripPackage)
            // When autocompleting Foo->new(...)->, we need the dropdown to show Foo->func,
            // but the replacement only to be ->func
            replaceText = replaceText.replace(/^(\w(?:\w|::\w)*)(?=->)/, '');

        const newElement: completionElement = { perlElement: element, docUri: perlDoc.uri };

        matches.push({
            label,
            textEdit: { newText: replaceText, range },
            kind,
            sortText: getSortText(label),
            detail,
            documentation,
            data: newElement
        });
    }

    return matches;
};

const getSortText = (label: string): string => {
    // Ensure sorting has public methods up front, followed by private and then capital.
    // (private vs somewhat capital is arbitrary, but public makes sense).
    // Variables will still be higher when relevant.
    // use English puts a lot of capital variables, so these will end up lower as well
    // (including Hungarian notation capitals)

    let sortText: string;

    if (/^[@$%]?[a-z]?[a-z]?[A-Z][A-Z_]*$/.test(label) || /(?:::|->)[A-Z][A-Z_]+$/.test(label)) {
        sortText = '4' + label;
    } else if (label == '_' || /(?:::|->)_\w+$/.test(label)) {
        sortText = '3' + label;
    } else if (/^\w$/.test(label) || /(?:::|->)\w+$/.test(label)) {
        // Public methods / functions
        sortText = '2';
        // Prioritize '->new'
        if (label.includes('->new')) sortText += '1';
        sortText += label;
    } else {
        // Variables and regex mistakes
        sortText = '1' + label;
    }
    return sortText;
};
