/* Perl Navigator server. See licenses.txt file for licensing and copyright information */

import type {
    Diagnostic,
    InitializeParams,
    InitializeResult,
    WorkspaceFolder,
    //Location,
    //CompletionItem,
    //CompletionList
    //TextDocumentPositionParams,
    TextEdit
} from 'vscode-languageserver/node';
import {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PublishDiagnosticsParams } from 'vscode-languageserver-protocol';
import { URI } from 'vscode-uri';

import { basename } from 'path';
import { homedir } from 'os';
import { LRUCache } from 'lru-cache';

import { perlcompile, perlcritic } from './diagnostics';
//import { getDefinition, getAvailableMods } from './navigation';
//import { getSymbols , getWorkspaceSymbols } from './symbols';
import type { PGLanguageServerSettings, PerlDocument /*, PerlElement */ } from './types';
//import { getHover } from './hover';
//import { getCompletions, getCompletionDoc } from './completion';
import { formatDoc, formatRange } from './formatting';
import { nLog } from './utils';
import { startProgress, endProgress } from './progress';
//import { getSignature } from './signatures';

// It the editor doesn't request node-ipc, use stdio instead. Make sure this runs before createConnection.
if (process.argv.length <= 2) process.argv.push('--stdio');

// Create a connection for the server
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments<TextDocument>(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

connection.onInitialize((params: InitializeParams) => {
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
    if (hasWorkspaceFolderCapability) result.capabilities.workspace = { workspaceFolders: { supported: true } };
    return result;
});

connection.onInitialized(() => {
    // Register for all configuration changes.
    if (hasConfigurationCapability) void connection.client.register(DidChangeConfigurationNotification.type, undefined);
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
    logging: true
};

let globalSettings: PGLanguageServerSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, PGLanguageServerSettings>();

// Store recent critic diagnostics to prevent blinking of diagnostics
const documentCriticDiagnostics = new Map<string, Diagnostic[]>();

// Store recent compilation diagnostics to prevent old diagnostics from resurfacing
const documentCompilationDiagnostics = new Map<string, Diagnostic[]>();

// A ballpark estimate is that 350k symbols will be about 35MB. A huge map, but a reasonable limit.
const navSymbols = new LRUCache({
    maxSize: 350000,
    sizeCalculation(value: PerlDocument) {
        return value.elements.size || 1;
    }
});

const timers = new Map<string, NodeJS.Timeout>();

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
    const workspaceFolder = await getCurrentWorkspaceFolder(textDocument);
    const newMods = await getAvailableMods(workspaceFolder, settings);
    availableMods.set('default', newMods);
    return;
};
*/

const getCurrentWorkspaceFolder = async (currentDocument: TextDocument): Promise<WorkspaceFolder | undefined> => {
    try {
        const workspaceFolders = await connection.workspace.getWorkspaceFolders();
        if (!workspaceFolders) return;
        workspaceFolders.sort((a, b) => b.uri.length - a.uri.length);
        const currentFolder = workspaceFolders.find((f) =>
            process.platform === 'win32' || process.platform === 'darwin'
                ? currentDocument.uri.toLowerCase().startsWith(f.uri)
                : currentDocument.uri.startsWith(f.uri)
        );
        return currentFolder;
    } catch {
        return;
    }
};

const expandTildePaths = (paths: string, settings: PGLanguageServerSettings): string => {
    const path = paths;
    // Consider that this is not a Windows feature,
    // So, Windows "%USERPROFILE%" currently is ignored (and rarely used).
    if (path.startsWith('~/')) {
        const newPath = homedir() + path.slice(1);
        nLog("Expanding tilde path '" + path + "' to '" + newPath + "'", settings);
        return newPath;
    } else {
        return path;
    }
};

const getDocumentSettings = async (resource: string): Promise<PGLanguageServerSettings> => {
    if (!hasConfigurationCapability) return globalSettings;

    let result = documentSettings.get(resource);
    if (!result) {
        result = (await connection.workspace.getConfiguration({ scopeUri: resource, section: 'pg' })) as
            | PGLanguageServerSettings
            | undefined;
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
    documentCriticDiagnostics.delete(e.document.uri);
    documentCompilationDiagnostics.delete(e.document.uri);
    navSymbols.delete(e.document.uri);
    void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

documents.onDidOpen((change) => {
    void validatePerlDocument(change.document);
    //buildModCache(change.document);
});

documents.onDidSave((change) => {
    void validatePerlDocument(change.document);
});

documents.onDidChangeContent((change) => {
    // VSCode sends a firehose of change events. Only check after it's been quiet for 1 second.
    const timer = timers.get(change.document.uri);
    if (timer) clearTimeout(timer);
    timers.set(
        change.document.uri,
        setTimeout(() => void validatePerlDocument(change.document), 1000)
    );
});

const validatePerlDocument = async (textDocument: TextDocument): Promise<void> => {
    const settings = await getDocumentSettings(textDocument.uri);

    const fileName = basename(URI.parse(textDocument.uri).fsPath);
    nLog(`Filename is ${fileName}`, settings);

    const progressToken = await startProgress(
        connection,
        navSymbols.has(textDocument.uri)
            ? `Updating diagnostics for ${fileName}`
            : `Initializing diagnostics for ${fileName}`
    );

    const workspaceFolder = await getCurrentWorkspaceFolder(textDocument);

    // Compile the file contents.
    const compilationStart = Date.now();
    const perlOut = await perlcompile(textDocument, workspaceFolder, settings);
    nLog('Compilation Time: ' + ((Date.now() - compilationStart) / 1000).toString() + ' seconds', settings);

    if (!perlOut) {
        documentCompilationDiagnostics.delete(textDocument.uri);
        endProgress(connection, progressToken);
        return;
    }
    documentCompilationDiagnostics.set(textDocument.uri, perlOut.diagnostics);
    navSymbols.set(textDocument.uri, perlOut.perlDoc);

    const criticDiagnostics: Diagnostic[] = [];

    if (settings.perlcriticEnabled) {
        // Execute perl critic on the file contents.
        const perlCriticStart = Date.now();
        criticDiagnostics.push(...(await perlcritic(textDocument, workspaceFolder, settings)));
        nLog('Perl Critic Time: ' + ((Date.now() - perlCriticStart) / 1000).toString() + ' seconds', settings);
    }

    // Set this even if perlcritic is disabled as old diagnostics
    // may need to be cleared if a user changed their settings.
    documentCriticDiagnostics.set(textDocument.uri, criticDiagnostics);

    const diagnostics = (documentCompilationDiagnostics.get(textDocument.uri) ?? []).concat(criticDiagnostics);
    if (diagnostics.length) sendDiagnostics({ uri: textDocument.uri, diagnostics });

    endProgress(connection, progressToken);
    return;
};

const sendDiagnostics = (params: PublishDiagnosticsParams): void => {
    // Before sending new diagnostics, check if the file is still open.
    if (documents.get(params.uri)) void connection.sendDiagnostics(params);
    else void connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
};

connection.onDidChangeConfiguration((change) => {
    void (async () => {
        if (hasConfigurationCapability) {
            // Reset all cached document settings
            documentSettings.clear();
        } else {
            globalSettings = {
                ...defaultSettings,
                ...((change.settings as { pg: PGLanguageServerSettings } | undefined)?.pg ?? {})
            } as PGLanguageServerSettings;
        }

        // This fires on all settings changes, not just pg language server settings.
        if ((change.settings as { pg: PGLanguageServerSettings } | undefined)?.pg) {
            //await rebuildModCache();
            for (const doc of documents.all()) {
                // sequential changes
                await validatePerlDocument(doc);
            }
        }
    })();
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
    const perlElement: PerlElement = item.data.perlElement;

    const perlDoc = navSymbols.get(item.data?.docUri);
    if (!perlDoc) return item;

    let mods = availableMods.get('default');
    if (!mods) mods = new Map();

    const docs = await getCompletionDoc(perlElement, perlDoc, mods);
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
    if (!document || !perlDoc) return;
    return await getDefinition(params, perlDoc, document, availableMods.get('default') ?? new Map());
});
*/

/*
connection.onDocumentSymbol(async (params) => {
    const document = documents.get(params.textDocument.uri);
    // It may be neccessary to async wait for the document to be processed, but I suspect the order is fine.
    if (!document) return;
    return getSymbols(document, params.textDocument.uri);
});
*/

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
    if (!document) return;

    const editOut: TextEdit[] | undefined = await formatDoc(
        params,
        document,
        settings,
        await getCurrentWorkspaceFolder(document),
        connection
    );
    return editOut;
});

connection.onDocumentRangeFormatting(async (params) => {
    const document = documents.get(params.textDocument.uri);
    const settings = await getDocumentSettings(params.textDocument.uri);
    if (!document) return;

    const editOut: TextEdit[] | undefined = await formatRange(
        params,
        document,
        settings,
        await getCurrentWorkspaceFolder(document),
        connection
    );
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
    /* Ignored */
});

process.on('unhandledRejection', (reason, p) => {
    console.error('Caught an unhandled Rejection at: Promise ', p, ' reason: ', reason);
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
