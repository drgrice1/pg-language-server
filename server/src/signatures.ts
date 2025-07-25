import type {
    TextDocumentPositionParams,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation
} from 'vscode-languageserver/node';
import type { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { type PerlDocument, type PerlElement, PerlSymbolKind } from './types';
import { lookupSymbol } from './utils';
import { refineElementIfSub } from './refinement';

export const getSignature = async (
    params: TextDocumentPositionParams,
    perlDoc: PerlDocument,
    txtDoc: TextDocument,
    modMap: Map<string, string>
): Promise<SignatureHelp | undefined> => {
    const position = params.position;
    const [symbol, currentSig] = getFunction(position, txtDoc);
    if (!symbol) return;
    const elements = lookupSymbol(perlDoc, modMap, symbol, position.line);
    // Nothing or too many things.
    if (elements.length != 1) return;
    const element = elements[0];
    const refined = await refineElementIfSub(element, params, perlDoc);
    if (!refined) return;
    // const element_count = perlDoc.elements.size; // Currently unused.
    return buildSignature(refined, currentSig, symbol);
};

const getFunction = (position: Position, txtDoc: TextDocument): string[] => {
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    let r = index; // right
    // Find signature.
    for (; r > 1 && text[r] != '('; --r) {
        if (r > 0 && text[r - 1] == ')') return []; // Sig closes
    }
    if (r <= 1) return [];
    let l = r - 1; // left
    const canShift = (c: string) => /[\w:>-]/.exec(c);
    for (; l >= 0 && canShift(text[l]); --l)
        // Allow for ->, but not => or > (e.g. $foo->bar, but not $foo=>bar or $foo>bar).
        if (text[l] == '>') if (l - 1 >= 0 && text[l - 1] != '-') break;

    if (l < 0 || (text[l] != '$' && text[l] != '@' && text[l] != '%')) ++l;

    let symbol = text.substring(l, r);
    const currSig = text.substring(r, index);

    const prefix = text.substring(0, l);

    if (/^->\w+$/.exec(symbol)) {
        // If you have Foo::Bar->new(...)->func, the extracted symbol will be ->func
        // We can special case this to Foo::Bar->func. The regex allows arguments to new(),
        // including params with matched ()
        const match = /(\w(?:\w|::\w)*)->new\((?:\([^()]*\)|[^()])*\)$/.exec(prefix);

        if (match) symbol = match[1] + symbol;
    }

    return [symbol, currSig];
};

const buildSignature = (element: PerlElement, currentSig: string, symbol: string): SignatureHelp | undefined => {
    let params = element.signature;
    if (!params) return;
    params = [...params]; // Clone to ensure we don't modify the original
    const activeParameter = (currentSig.match(/,/g) ?? []).length;
    if (symbol.includes('->') && element.type != PerlSymbolKind.LocalMethod) {
        // Subroutine vs method is not relevant, only matters if you called it as a method (except Corinna,
        // for which $self is implicit)
        params.shift();
    }
    if (params.length == 0) return;
    const paramLabels: ParameterInformation[] = [];
    for (const param of params) paramLabels.push({ label: param });
    const mainSig: SignatureInformation = {
        parameters: paramLabels,
        label: '(' + params.join(', ') + ')'
    };
    return {
        signatures: [mainSig],
        activeSignature: 0,
        activeParameter: activeParameter
    };
};
