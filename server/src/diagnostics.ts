import { type Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { join } from 'path';
import type { ExecException } from 'child_process';
import { ParseType, type PGLanguageServerSettings, type CompilationResults, type PerlDocument } from './types';
import { getIncPaths, async_execFile, nLog, getPerlAssetsPath } from './utils';
import { buildNav } from './parseTags';
import { parseDocument } from './parser';

export const perlcompile = async (
    textDocument: TextDocument,
    workspaceFolder: WorkspaceFolder | undefined,
    settings: PGLanguageServerSettings
): Promise<CompilationResults | undefined> => {
    const parsingPromise = parseDocument(textDocument, ParseType.selfNavigation);

    if (!settings.perlCompileEnabled) {
        const parsedDoc = await parsingPromise;
        return { diagnostics: [], perlDoc: parsedDoc };
    }
    const perlParams: string[] = [...settings.perlParams, '-c'];
    const filePath = URI.parse(textDocument.uri).fsPath;

    // Force enable some warnings if configured to do so.
    if (settings.enableWarnings) perlParams.push('-Mwarnings', '-M-warnings=redefine');
    perlParams.push(...getIncPaths(workspaceFolder, settings));
    perlParams.push('-I', getPerlAssetsPath(), '-MInquisitor');
    nLog(
        `Starting perl compilation check with the equivalent of: ${
            settings.perlPath
        } ${perlParams.join(' ')} ${filePath}`,
        settings
    );

    let output: string;
    let stdout: string;
    let severity: DiagnosticSeverity;
    const diagnostics: Diagnostic[] = [];
    const code = getAdjustedPerlCode(textDocument, filePath);
    try {
        const options: {
            timeout: number;
            maxBuffer: number;
            env?: Record<string, string | undefined>;
        } = { timeout: 10000, maxBuffer: 20 * 1024 * 1024 };
        if (settings.perlEnv) {
            if (settings.perlEnvAdd) {
                options.env = { ...process.env, ...settings.perlEnv };
            } else {
                options.env = settings.perlEnv;
            }
        }
        const perlProcess = async_execFile(settings.perlPath, perlParams, options);
        perlProcess.child.stdin?.on('error', (error: string) => {
            nLog('Perl Compilation Error Caught: ', settings);
            nLog(error, settings);
        });
        perlProcess.child.stdin?.write(code);
        perlProcess.child.stdin?.end();
        const out = await perlProcess;

        output = out.stderr.toString();
        stdout = out.stdout.toString();
        severity = DiagnosticSeverity.Warning;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // TODO: Check if we overflowed the buffer.
        if ('stderr' in error && 'stdout' in error) {
            output = (error as ExecException).stderr?.toString() ?? '';
            stdout = (error as ExecException).stdout?.toString() ?? '';
            severity = DiagnosticSeverity.Error;
        } else {
            nLog('Perlcompile failed with unknown error', settings);
            nLog(error as unknown as string, settings);
            return;
        }
    }

    const compiledDoc = buildNav(stdout, filePath, textDocument.uri);
    const parsedDoc = await parsingPromise;
    const mergedDoc = mergeDocs(parsedDoc, compiledDoc);

    for (const violation of output.split('\n')) {
        maybeAddCompDiag(violation, severity, diagnostics, filePath, mergedDoc);
    }

    // If a base object throws a warning multiple times, we want to deduplicate it to declutter the problems tab.
    const uniq_diagnostics = Array.from(new Set(diagnostics.map((diag) => JSON.stringify(diag)))).map(
        (str) => JSON.parse(str) as Diagnostic
    );
    return { diagnostics: uniq_diagnostics, perlDoc: mergedDoc };
};

const translateCode = (code: string): string => {
    return code
        .replaceAll(/\r\n/g, '\n')
        .replaceAll(/\n[ \t]*END_TEXT[ \t;]*\n/g, '\nEND_TEXT\n')
        .replaceAll(/\n[ \t]*END_PGML[ \t;]*\n/g, '\nEND_PGML\n')
        .replaceAll(/\n[ \t]*END_PGML_SOLUTION[ \t;]*\n/g, '\nEND_PGML_SOLUTION\n')
        .replaceAll(/\n[ \t]*END_PGML_HINT[ \t;]*\n/g, '\nEND_PGML_HINT\n')
        .replaceAll(/\n[ \t]*END_SOLUTION[ \t;]*\n/g, '\nEND_SOLUTION\n')
        .replaceAll(/\n[ \t]*END_HINT[ \t;]*\n/g, '\nEND_HINT\n')
        .replaceAll(/\n[ \t]*BEGIN_TEXT[ \t;]*\n/g, "\nSTATEMENT(EV3P(<<'END_TEXT'));\n")
        .replaceAll(/\n[ \t]*BEGIN_PGML[ \t;]*\n/g, "\nSTATEMENT(PGML::Format2(<<'END_PGML'));\n")
        .replaceAll(/\n[ \t]*BEGIN_PGML_SOLUTION[ \t;]*\n/g, "\nSOLUTION(PGML::Format2(<<'END_PGML_SOLUTION'));\n")
        .replaceAll(/\n[ \t]*BEGIN_PGML_HINT[ \t;]*\n/g, "\nHINT(PGML::Format2(<<'END_PGML_HINT'));\n")
        .replaceAll(/\n[ \t]*BEGIN_SOLUTION[ \t;]*\n/g, "\nSOLUTION(EV3P(<<'END_SOLUTION'));\n")
        .replaceAll(/\n[ \t]*BEGIN_HINT[ \t;]*\n/g, "\nHINT(EV3P(<<'END_HINT'));\n")
        .replaceAll(/\n[ \t]*(.*?)[ \t]*->[ \t]*BEGIN_TIKZ[ \t;]*\n/g, '\n$1->tex(<<END_TIKZ);\n')
        .replaceAll(/\n[ \t]*END_TIKZ[ \t;]*\n/g, '\nEND_TIKZ\n')
        .replaceAll(/\n[ \t]*(.*)[ \t]*->[ \t]*BEGIN_LATEX_IMAGE[ \t;]*\n/g, '\n$1->tex(<<END_LATEX_IMAGE);\n')
        .replaceAll(/\n[ \t]*END_LATEX_IMAGE[ \t;]*\n/g, '\nEND_LATEX_IMAGE\n')
        .replace(/ENDDOCUMENT[\s\S]*/m, 'ENDDOCUMENT();')
        .replaceAll('\\', '\\\\')
        .replaceAll('~~', '\\');
};

const getAdjustedPerlCode = (textDocument: TextDocument, filePath: string): string => {
    let code = textDocument.getText();

    // module name regex stolen from https://metacpan.org/pod/Module::Runtime#$module_name_rx
    const module_name_rx = /^\s*package[\s\n]+([A-Z_a-z][0-9A-Z_a-z]*(?:::[0-9A-Z_a-z]+)*)/gm;
    let register_inc_path = '';
    let module_name_match = module_name_rx.exec(code);
    while (module_name_match != null) {
        const module_name = module_name_match[1];
        const inc_filename = module_name.replaceAll('::', '/') + '.pm';
        // make sure the package found actually matches the filename
        if (filePath.includes(inc_filename)) {
            register_inc_path = `$INC{'${inc_filename}'} = '${filePath}';`;
            break;
        } else {
            module_name_match = module_name_rx.exec(code);
        }
    }

    code =
        `local $0; use lib_bs22::SourceStash; BEGIN { $0 = '${
            filePath
        }'; if ($INC{'FindBin.pm'}) { FindBin->again(); }; $lib_bs22::SourceStash::filename = '${
            filePath
        }'; ${register_inc_path} }\n# line 0 "${filePath}"\ndie 'Not needed, but die for safety';\n` +
        translateCode(code);
    return code;
};

const maybeAddCompDiag = (
    violation: string,
    severity: DiagnosticSeverity,
    diagnostics: Diagnostic[],
    filePath: string,
    perlDoc: PerlDocument
): void => {
    violation = violation.replaceAll('\r', ''); // Clean up for Windows
    violation = violation.replace(/, <STDIN> line 1\.$/g, ''); // Remove our stdin nonsense

    const output = localizeErrors(violation, filePath, perlDoc);
    if (typeof output == 'undefined') return;
    const lineNum = output.lineNum;
    violation = output.violation;

    if (violation.includes('=PerlWarning=')) {
        // Downgrade severity for explicitly marked severities
        severity = DiagnosticSeverity.Warning;
        violation = violation.replaceAll('=PerlWarning=', ''); // Don't display the PerlWarnings
    }

    diagnostics.push({
        severity: severity,
        range: {
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: 500 }
        },
        message: 'Syntax: ' + violation,
        source: 'pg-language-server'
    });
};

const localizeErrors = (
    violation: string,
    filePath: string,
    perlDoc: PerlDocument
): { violation: string; lineNum: number } | undefined => {
    if (violation.includes('Too late to run CHECK block')) return;

    let match = /^(.+)at\s+(.+?)\s+line\s+(\d+)/i.exec(violation);

    if (match) {
        if (match[2] == filePath) {
            violation = match[1];
            const lineNum = +match[3] - 1;
            return { violation, lineNum };
        } else {
            // The error/warnings must be in an imported library (possibly indirectly imported).
            let lineNum = 0; // If indirectly imported
            const importFileName = match[2].replace('.pm', '').replace(/[\\/]/g, '::');
            for (const [mod, line] of perlDoc.imported) {
                // importFileName could be something like usr::lib::perl::dir::Foo::Bar
                if (importFileName.endsWith(mod)) lineNum = line;
            }
            return { violation, lineNum };
        }
    }

    match = /\s+is not exported by the ([\w:]+) module$/i.exec(violation);
    if (match) {
        let lineNum = perlDoc.imported.get(match[1]);
        if (typeof lineNum == 'undefined') lineNum = 0;
        return { violation, lineNum };
    }
    return;
};

export const perlcritic = async (
    textDocument: TextDocument,
    workspaceFolder: WorkspaceFolder | undefined,
    settings: PGLanguageServerSettings
): Promise<Diagnostic[]> => {
    if (!settings.perlcriticEnabled) return [];
    const critic_path = join(getPerlAssetsPath(), 'pgCriticWrapper.pl');
    let criticParams: string[] = [...settings.perlParams, critic_path].concat(
        getCriticProfile(workspaceFolder, settings)
    );
    criticParams = criticParams.concat(['--file', URI.parse(textDocument.uri).fsPath]);

    // Add any extra params from settings
    if (settings.perlcriticSeverity)
        criticParams = criticParams.concat(['--severity', settings.perlcriticSeverity.toString()]);
    if (settings.perlcriticTheme) criticParams = criticParams.concat(['--theme', settings.perlcriticTheme]);
    if (settings.perlcriticExclude) criticParams = criticParams.concat(['--exclude', settings.perlcriticExclude]);
    if (settings.perlcriticInclude) criticParams = criticParams.concat(['--include', settings.perlcriticInclude]);

    nLog('Now starting perlcritic with: ' + criticParams.join(' '), settings);
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, criticParams, { timeout: 25000 });
        process.child.stdin?.on('error', (error: string) => {
            nLog('Perl Critic Error Caught: ', settings);
            nLog(error, settings);
        });
        process.child.stdin?.write(code);
        process.child.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: unknown) {
        nLog('Perlcritic failed with unknown error', settings);
        nLog(error as string, settings);
        return diagnostics;
    }

    nLog(output.replace(/\n$/, ''), settings);
    for (const violation of output.split('\n')) {
        maybeAddCriticDiag(violation, diagnostics, settings);
    }

    return diagnostics;
};

const getCriticProfile = (
    workspaceFolder: WorkspaceFolder | undefined,
    settings: PGLanguageServerSettings
): string[] => {
    const profileCmd: string[] = [];
    if (settings.perlcriticProfile) {
        const profile = settings.perlcriticProfile;
        if (profile.includes('$workspaceFolder')) {
            if (workspaceFolder) {
                const workspaceUri = URI.parse(workspaceFolder.uri).fsPath;
                profileCmd.push('--profile');
                profileCmd.push(profile.replaceAll('$workspaceFolder', workspaceUri));
            } else {
                nLog(
                    'You specified $workspaceFolder in your perlcritic path, ' +
                        "but didn't include any workspace folders. Ignoring pr file.",
                    settings
                );
            }
        } else {
            profileCmd.push('--profile');
            profileCmd.push(profile);
        }
    }
    return profileCmd;
};

const maybeAddCriticDiag = (violation: string, diagnostics: Diagnostic[], settings: PGLanguageServerSettings): void => {
    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace('~||~', '').replaceAll('\r', '').split('~|~');
    if (tokens.length != 5) return;

    const line_num = +tokens[1] - 1;
    const col_num = +tokens[2] - 1;
    const message = tokens[3] + ' (' + tokens[4] + ', Severity: ' + tokens[0] + ')';
    const severity = getCriticDiagnosticSeverity(tokens[0], settings);
    if (!severity) return;

    diagnostics.push({
        severity: severity,
        range: {
            start: { line: line_num, character: col_num },
            end: { line: line_num, character: col_num + 500 } // Arbitrarily large
        },
        message: 'Critic: ' + message,
        source: 'pg-language-server'
    });
};

const getCriticDiagnosticSeverity = (
    severity_num: string,
    settings: PGLanguageServerSettings
): DiagnosticSeverity | undefined => {
    // Unknown severity gets max (should never happen)
    const severity_config =
        severity_num == '1'
            ? settings.severity1
            : severity_num == '2'
              ? settings.severity2
              : severity_num == '3'
                ? settings.severity3
                : severity_num == '4'
                  ? settings.severity4
                  : settings.severity5;

    switch (severity_config) {
        case 'none':
            return undefined;
        case 'hint':
            return DiagnosticSeverity.Hint;
        case 'info':
            return DiagnosticSeverity.Information;
        case 'warning':
            return DiagnosticSeverity.Warning;
        default:
            return DiagnosticSeverity.Error;
    }
};

const mergeDocs = (doc1: PerlDocument, doc2: PerlDocument): PerlDocument => {
    // TODO: Redo this code. Instead of merging sources, you should keep track of where symbols came from

    doc1.autoloads = new Map([...doc1.autoloads, ...doc2.autoloads]);
    doc1.canonicalElements = new Map([...doc1.canonicalElements, ...doc2.canonicalElements]);

    // TODO: Should elements be merged? Probably. Or tagged doc and compilation results are totally split
    doc1.elements = new Map([...doc2.elements, ...doc1.elements]); // Tagged docs have priority?
    doc1.imported = new Map([...doc1.imported, ...doc2.imported]);
    doc1.parents = new Map([...doc1.parents, ...doc2.parents]);
    doc1.uri = doc2.uri;

    return doc1;
};
