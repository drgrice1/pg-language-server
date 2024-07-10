/* Perl Navigator server. See licenses.txt file for licensing and copyright information */

import type {
    Diagnostic,
    InitializeParams,
    InitializeResult,
    WorkspaceFolder
    //Location,
    //CompletionItem,
    //CompletionList
    //TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    TextEdit
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';

import { basename } from 'path';
import { homedir } from 'os';
import { LRUCache } from 'lru-cache';

import { perlcompile, perlcritic } from './diagnostics';
import { cleanupTemporaryAssetPath } from './assets';
//import { getDefinition, getAvailableMods } from './navigation';
import { getSymbols /*, getWorkspaceSymbols */ } from './symbols';
import type { PGLanguageServerSettings, PerlDocument /*, PerlElem */ } from './types';
//import { getHover } from './hover';
//import { getCompletions, getCompletionDoc } from './completion';
import { formatDoc, formatRange } from './formatting';
import { nLog } from './utils';
import { startProgress, endProgress } from './progress';
//import { getSignature } from './signatures';
import { getPerlAssetsPath } from './assets';

// It the editor doesn't request node-ipc, use stdio instead. Make sure this runs before createConnection
if (process.argv.length <= 2) {
    process.argv.push('--stdio');
}

// Create a connection for the server
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize(async (params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,

            /*
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['$', '@', '%', '-', '>', ':']
            },

            definitionProvider: true, // goto definition
            documentSymbolProvider: true, // Outline view and breadcrumbs
            workspaceSymbolProvider: true,
            hoverProvider: true,
            */
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true
            /*
            signatureHelpProvider: {
                // Triggers open signature help, switch to next param, and then close help
                triggerCharacters: ['(', ',', ')']
            }
            */
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    await getPerlAssetsPath(); // Ensures assets are unpacked. Should this be in onInitialized?
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Does not happen with the vscode client could happen with other clients.
// The "real" default settings are in the top-level package.json
const defaultSettings: PGLanguageServerSettings = {
    perlPath: 'perl',
    perlParams: [],
    enableWarnings: false,
    perltidyProfile: '',
    perlcriticProfile: '',
    perlcriticEnabled: true,
    perlcriticSeverity: undefined,
    perlcriticTheme: undefined,
    perlcriticExclude: undefined,
    perlcriticInclude: undefined,
    perltidyEnabled: true,
    perlCompileEnabled: true,
    perlEnv: undefined,
    perlEnvAdd: true,
    severity5: 'warning',
    severity4: 'info',
    severity3: 'hint',
    severity2: 'hint',
    severity1: 'hint',
    includePaths: [],
    includeLib: true,
    logging: true,
    enableProgress: false
};

let globalSettings: PGLanguageServerSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, PGLanguageServerSettings> = new Map();

// Store recent critic diags to prevent blinking of diagnostics
const documentDiags: Map<string, Diagnostic[]> = new Map();

// Store recent compilation diags to prevent old diagnostics from resurfacing
const documentCompDiags: Map<string, Diagnostic[]> = new Map();

// A ballpark estimate is that 350k symbols will be about 35MB. A huge map, but a reasonable limit.
const navSymbols = new LRUCache({
    maxSize: 350000,
    sizeCalculation(value: PerlDocument) {
        return value.elems.size;
    }
});

const timers: Map<string, NodeJS.Timeout> = new Map();

/*
// Keep track of modules available for import. Building this is a slow operations and varies based on workspace
// settings, not documents
const availableMods: Map<string, Map<string, string>> = new Map();
let modCacheBuilt: boolean = false;

const rebuildModCache = async (): Promise<void> => {
    const allDocs = documents.all();
    if (allDocs.length > 0) {
        modCacheBuilt = true;
        dispatchForMods(allDocs[allDocs.length - 1]); // Rebuild with recent file
    }
    return;
};

const buildModCache = async (textDocument: TextDocument): Promise<void> => {
    if (!modCacheBuilt) {
        modCacheBuilt = true; // Set true first to prevent other files from building concurrently.
        dispatchForMods(textDocument);
    }
    return;
};

const dispatchForMods = async (textDocument: TextDocument): Promise<void> => {
    // BIG TODO: Resolution of workspace settings? How to do? Maybe build a hash of all include paths.
    const settings = await getDocumentSettings(textDocument.uri);
    const workspaceFolders = await getWorkspaceFoldersSafe();
    const newMods = await getAvailableMods(workspaceFolders, settings);
    availableMods.set('default', newMods);
    return;
};
*/

const getWorkspaceFoldersSafe = async (): Promise<WorkspaceFolder[]> => {
    try {
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        return workspaceFolders ?? [];
    } catch {
        return [];
    }
};

const expandTildePaths = (paths: string, settings: PGLanguageServerSettings): string => {
    const path = paths;
    // Consider that this not a Windows feature,
    // so, Windows "%USERPROFILE%" currently is ignored (and rarely used).
    if (path.startsWith('~/')) {
        const newPath = homedir() + path.slice(1);
        nLog("Expanding tilde path '" + path + "' to '" + newPath + "'", settings);
        return newPath;
    } else {
        return path;
    }
};

const getDocumentSettings = async (resource: string): Promise<PGLanguageServerSettings> => {
    if (!hasConfigurationCapability) {
        return globalSettings;
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = await connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'pg'
        });
        if (!result) return globalSettings;
        const resolvedSettings = { ...globalSettings, ...result };

        if (resolvedSettings.includePaths) {
            resolvedSettings.includePaths = resolvedSettings.includePaths.map((path: string) =>
                expandTildePaths(path, resolvedSettings)
            );
        }
        if (resolvedSettings.perlPath) {
            resolvedSettings.perlPath = expandTildePaths(resolvedSettings.perlPath, resolvedSettings);
        }
        if (resolvedSettings.perltidyProfile) {
            resolvedSettings.perltidyProfile = expandTildePaths(resolvedSettings.perltidyProfile, resolvedSettings);
        }
        if (resolvedSettings.perlcriticProfile) {
            resolvedSettings.perlcriticProfile = expandTildePaths(resolvedSettings.perlcriticProfile, resolvedSettings);
        }
        if (resolvedSettings.perlEnv) {
            resolvedSettings.perlEnv = Object.fromEntries(
                Object.entries(resolvedSettings.perlEnv).map(([key, value]) => [
                    key,
                    expandTildePaths(value, resolvedSettings)
                ])
            );
        }

        documentSettings.set(resource, resolvedSettings);
        return resolvedSettings;
    }
    return result;
};

// Only keep settings for open documents
documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
    documentDiags.delete(e.document.uri);
    documentCompDiags.delete(e.document.uri);
    navSymbols.delete(e.document.uri);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.onDidOpen((change) => {
    validatePerlDocument(change.document);
    //buildModCache(change.document);
});

documents.onDidSave((change) => {
    validatePerlDocument(change.document);
});

documents.onDidChangeContent((change) => {
    // VSCode sends a firehose of change events. Only check after it's been quiet for 1 second.
    const timer = timers.get(change.document.uri);
    if (timer) clearTimeout(timer);
    timers.set(
        change.document.uri,
        setTimeout(() => validatePerlDocument(change.document), 1000)
    );
});

const validatePerlDocument = async (textDocument: TextDocument): Promise<void> => {
    const settings = await getDocumentSettings(textDocument.uri);

    const fileName = basename(URI.parse(textDocument.uri).fsPath);
    nLog(`Filename is ${fileName}`, settings);

    const progressToken = navSymbols.has(textDocument.uri)
        ? null
        : await startProgress(connection, `Initializing ${fileName}`, settings);

    const start = Date.now();

    const workspaceFolders = await getWorkspaceFoldersSafe();

    const pCompile = perlcompile(textDocument, workspaceFolders, settings); // Start compilation
    const pCritic = perlcritic(textDocument, workspaceFolders, settings); // Start perlcritic

    const perlOut = await pCompile;
    nLog('Compilation Time: ' + (Date.now() - start) / 1000 + ' seconds', settings);
    const oldCriticDiags = documentDiags.get(textDocument.uri);
    if (!perlOut) {
        documentCompDiags.delete(textDocument.uri);
        endProgress(connection, progressToken);
        return;
    }
    documentCompDiags.set(textDocument.uri, perlOut.diags);

    let mixOldAndNew = perlOut.diags;
    if (oldCriticDiags && settings.perlcriticEnabled) {
        // Resend old critic diags to avoid overall file "blinking" in between receiving compilation and critic.
        // TODO: async wait if it's not that long.
        mixOldAndNew = perlOut.diags.concat(oldCriticDiags);
    }
    sendDiags({ uri: textDocument.uri, diagnostics: mixOldAndNew });

    navSymbols.set(textDocument.uri, perlOut.perlDoc);

    // Perl critic things
    const diagCritic = await pCritic;
    let newDiags: Diagnostic[] = [];

    if (settings.perlcriticEnabled) {
        newDiags = newDiags.concat(diagCritic);
        nLog('Perl Critic Time: ' + (Date.now() - start) / 1000 + ' seconds', settings);
    }

    documentDiags.set(textDocument.uri, newDiags); // May need to clear out old ones if a user changed their settings.

    let compDiags = documentCompDiags.get(textDocument.uri);
    compDiags = compDiags ?? [];

    if (newDiags) {
        const allNewDiags = compDiags.concat(newDiags);
        sendDiags({ uri: textDocument.uri, diagnostics: allNewDiags });
    }
    endProgress(connection, progressToken);
    return;
};

const sendDiags = (params: PublishDiagnosticsParams): void => {
    // Before sending new diagnostics, check if the file is still open.
    if (documents.get(params.uri)) {
        connection.sendDiagnostics(params);
    } else {
        connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
    }
};

connection.onDidChangeConfiguration(async (change) => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = { ...defaultSettings, ...change?.settings?.pg };
    }

    if (change?.settings?.pg) {
        // Despite what it looks like, this fires on all settings changes, not just Navigator
        //await rebuildModCache();
        for (const doc of documents.all()) {
            // sequential changes
            await validatePerlDocument(doc);
        }
    }
});

/*
// This handler provides the initial list of the completion items.
connection.onCompletion((params: TextDocumentPositionParams): CompletionList | undefined => {
    const document = documents.get(params.textDocument.uri);
    const perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');

    if (!document) return;
    if (!perlDoc) return;
    if (!mods) mods = new Map();
    const completions: CompletionItem[] = getCompletions(params, perlDoc, document, mods);
    return {
        items: completions,
        isIncomplete: false
    };
});

connection.onCompletionResolve(async (item: CompletionItem): Promise<CompletionItem> => {
    const perlElem: PerlElem = item.data.perlElem;

    const perlDoc = navSymbols.get(item.data?.docUri);
    if (!perlDoc) return item;

    let mods = availableMods.get('default');
    if (!mods) mods = new Map();

    const docs = await getCompletionDoc(perlElem, perlDoc, mods);
    if (docs?.match(/\w/)) {
        item.documentation = { kind: 'markdown', value: docs };
    }
    return item;
});
*/

/*
connection.onHover(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const perlDoc = navSymbols.get(params.textDocument.uri);
    if (!document || !perlDoc) return;
    return await getHover(params, perlDoc, document, availableMods.get('default') ?? new Map<string, string>());
});
*/

/*
connection.onDefinition(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');
    if (!mods) mods = new Map();
    if (!document) return;
    if (!perlDoc) return;
    const locOut: Location | Location[] | undefined = await getDefinition(params, perlDoc, document, mods);
    return locOut;
});
*/

connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri);
    // We might  need to async wait for the document to be processed, but I suspect the order is fine
    if (!document) return;
    return getSymbols(document, params.textDocument.uri);
});

/*
connection.onWorkspaceSymbol((params) => {
    const defaultMods = availableMods.get('default');
    if (!defaultMods) return;
    return getWorkspaceSymbols(params, defaultMods);
});
*/

connection.onDocumentFormatting(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const settings = await getDocumentSettings(params.textDocument.uri);
    if (!document || !settings) return;

    const workspaceFolders = await getWorkspaceFoldersSafe();

    const editOut: TextEdit[] | undefined = await formatDoc(params, document, settings, workspaceFolders, connection);
    return editOut;
});

connection.onDocumentRangeFormatting(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const settings = await getDocumentSettings(params.textDocument.uri);
    if (!document || !settings) return;

    const workspaceFolders = await getWorkspaceFoldersSafe();

    const editOut: TextEdit[] | undefined = await formatRange(params, document, settings, workspaceFolders, connection);
    return editOut;
});

/*
connection.onSignatureHelp(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');
    if (!mods) mods = new Map();
    if (!document || !perlDoc) return;
    const signature = await getSignature(params, perlDoc, document, mods);
    return signature;
});
*/

connection.onShutdown(() => {
    try {
        cleanupTemporaryAssetPath();
    } catch {
        /* Ignored */
    }
});

process.on('unhandledRejection', (reason, p) =>
    console.error('Caught an unhandled Rejection at: Promise ', p, ' reason: ', reason)
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
