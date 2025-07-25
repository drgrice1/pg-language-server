// Settings for the pg language server,
// defaults for configurable editors stored in package.json
// defaults for non-configurable editors in server.ts

import type { Diagnostic } from 'vscode-languageserver/node';

export interface PGLanguageServerSettings {
    perlPath: string;
    perlParams: string[];
    enableWarnings: boolean;
    perlcriticProfile: string;
    perlcriticEnabled: boolean;
    perlcriticSeverity: undefined | number;
    perlcriticTheme: undefined | string;
    perlcriticExclude: undefined | string;
    perlcriticInclude: undefined | string;
    perltidyEnabled: boolean;
    perltidyProfile: string;
    perlCompileEnabled: boolean;
    perlEnv: undefined | Record<string, string>;
    perlEnvAdd: boolean;
    severity5: string;
    severity4: string;
    severity3: string;
    severity2: string;
    severity1: string;
    includePaths?: string[];
    logging: boolean;
}

export interface PerlElement {
    name: string;
    type: PerlSymbolKind;
    typeDetail: string;
    signature?: string[];
    uri: string;
    package: string;
    line: number;
    lineEnd: number;
    value: string;
    source: ElementSource;
}

export interface PerlDocument {
    elements: Map<string, PerlElement[]>;
    canonicalElements: Map<string, PerlElement>;
    autoloads: Map<string, PerlElement>;
    imported: Map<string, number>;
    parents: Map<string, string>;
    uri: string;
}

export enum ElementSource {
    symbolTable,
    modHunter,
    parser,
    packageInference
}

export enum ParseType {
    outline,
    selfNavigation,
    refinement
}

export interface CompilationResults {
    diagnostics: Diagnostic[];
    perlDoc: PerlDocument;
}

export interface CompletionPrefix {
    symbol: string;
    charStart: number;
    charEnd: number;
    stripPackage: boolean;
}

// Ensure TagKind and PerlSymbolKind have no overlap
export enum TagKind {
    Canonical2 = '2',
    UseStatement = 'u' // Reserved: used in pltags, but removed before symbol assignment.
}

export interface completionElement {
    perlElement: PerlElement;
    docUri: string;
}

export enum PerlSymbolKind {
    Module = 'm',
    Package = 'p',
    ImportedSub = 't',
    Inherited = 'i',
    LocalSub = 's',
    LocalMethod = 'o', // Assumed to be instance methods
    Method = 'x', // Assumed to be instance methods
    LocalVar = 'v',
    Label = 'l',
    Phaser = 'e',
    Canonical = '1', // 2 and 3 are also reserved
    ImportedVar = 'c',
    ImportedHash = 'h',
    HttpRoute = 'g',
    OutlineOnlySub = 'j',
    AutoLoadVar = '3'
}
