import { URI } from 'vscode-uri';
import * as fs from 'fs';
import { type PerlDocument, type PerlElement, PerlSymbolKind } from './types';
import { isFile } from './utils';

export const getPod = async (
    element: PerlElement,
    perlDoc: PerlDocument,
    modMap: Map<string, string>
): Promise<string | undefined> => {
    const absolutePath = await resolvePathForDoc(element, perlDoc, modMap);
    if (!absolutePath) return;

    let fileContent;
    try {
        fileContent = await fs.promises.readFile(absolutePath, 'utf8');
    } catch {
        return;
    }

    // Initialize state variables
    let inPodBlock = false;
    let inRelevantBlock = true;
    let podContent = '';
    let podBuffer = ''; // We "buffer" pod when searching to avoid empty sections
    let meaningFullContent = false;
    let searchItem;

    if ([PerlSymbolKind.Package, PerlSymbolKind.Module].includes(element.type)) {
        // Search all. Note I'm not really treating packages different from Modules
    } else if (
        [
            PerlSymbolKind.ImportedSub,
            PerlSymbolKind.Method,
            PerlSymbolKind.Inherited,
            PerlSymbolKind.LocalMethod,
            PerlSymbolKind.LocalSub
        ].includes(element.type)
    ) {
        searchItem = element.name;
        searchItem = searchItem.replace(/^[\w:]+::(\w+)$/, '$1'); // Remove package
    } else {
        return;
    }

    let markdown = '';

    // Quick search for leading comments of a very specific form with comment blocks the preceed a sub (and aren't
    // simply get/set without docs). These regexes are painful, but I didn't want to mix this with the line-by-line POD
    // parsing which would overcomplicate that piece
    let match, match2;
    if (
        searchItem &&
        (match = fileContent.match(
            `\\r?\\n#(?:####+| -+) *(?:\\r?\\n# *)*${searchItem}\\r?\\n((?:(?:#.*| *)\\r?\\n)+)sub +${searchItem}\\b`
        ))
    ) {
        // Ensure it's not an empty get/set pair.
        if (
            !(
                (match2 = /^get_(\w+)$/.exec(searchItem)) &&
                new RegExp(`^(?:# +set_${match2[1]}\\r?\\n)?[\\s#]*$`).exec(match[1])
            )
        ) {
            let content = match[1].replace(/^ *#+ ?/gm, '');
            content = content.replace(/^\s+|\s+$/g, '');
            if (content) {
                // It may still be empty for non-get functions
                markdown += '```text\n' + content + '\n```\n';
            }
        }
    }

    // Split the file into lines and iterate through them
    for (const line of fileContent.split(/\r?\n/)) {
        // =cut lines are not added.
        if (line.startsWith('=cut')) inPodBlock = false;

        if (/^=(pod|head\d|over|item|back|begin|end|for|encoding)/.exec(line)) {
            inPodBlock = true;
            meaningFullContent = false;
            if (searchItem && new RegExp(`^=(head\\d|item).*\\b${searchItem}\\b`).exec(line)) {
                // This is structured so if we hit two relevant block in a row, we keep them both
                inRelevantBlock = true;
            } else {
                inRelevantBlock = false;
                podBuffer = '';
            }
        } else if (/\w/.exec(line)) {
            // For this section, we found something that's not a header and has content
            meaningFullContent = true;
        }

        if (inPodBlock) {
            if (searchItem) {
                if (inRelevantBlock) podBuffer += line + '\n';
            } else {
                podContent += line + '\n';
            }
        }

        if (meaningFullContent && podBuffer != '') {
            podContent += podBuffer;
            podBuffer = '';
        }
    }

    markdown += convertPODToMarkdown(podContent);

    return markdown;
};

const resolvePathForDoc = async (
    element: PerlElement,
    perlDoc: PerlDocument,
    modMap: Map<string, string>
): Promise<string | undefined> => {
    const absolutePath = URI.parse(element.uri).fsPath;

    const foundPath = await fsPathOrAlt(absolutePath);
    if (foundPath) return foundPath;

    if (element.package) {
        const elementResolved = perlDoc.elements.get(element.package);

        if (!elementResolved) {
            // Looking up a module by the package name is only convention, but helps for things like POSIX
            const modUri = modMap.get(element.package);
            if (modUri) {
                const modPath = await fsPathOrAlt(URI.parse(modUri).fsPath);
                if (modPath) return modPath;
            }
            return;
        }

        for (const potentialElement of elementResolved) {
            const potentialPath = URI.parse(potentialElement.uri).fsPath;
            const foundPackPath = await fsPathOrAlt(potentialPath);
            if (foundPackPath) return foundPackPath;
        }
    }
};

const fsPathOrAlt = async (fsPath: string | undefined): Promise<string | undefined> => {
    if (!fsPath) return;

    if (fsPath.endsWith('.pm')) {
        const podPath = fsPath.replace(/\.pm$/, '.pod');
        if (!(await badFile(podPath))) return podPath;
    }
    if (!(await badFile(fsPath))) return fsPath;
    return;
};

const badFile = async (fsPath: string): Promise<boolean> => {
    if (!fsPath || fsPath.length <= 1) return true;
    if (/\w+\.c$/.test(fsPath)) return true;
    if (!(await isFile(fsPath))) return true;
    return false;
};

interface ConversionState {
    inList: boolean;
    inVerbatim: boolean;
    inCustomBlock: boolean;
    markdown: string;
    encoding: string | null; // Currently processed, but not used
    waitingForListTitle: boolean;
}

const convertPODToMarkdown = (pod: string): string => {
    let finalMarkdown = '';
    let state: ConversionState = {
        inList: false,
        inVerbatim: false,
        inCustomBlock: false,
        markdown: '',
        encoding: null,
        waitingForListTitle: false
    };

    for (let line of pod.split('\n')) {
        // Check for verbatim blocks first, perhaps ending a prior one
        if (shouldConsiderVerbatim(line) || state.inVerbatim) {
            state = processVerbatim(line, state);
            finalMarkdown += state.markdown;
            // Don't need to keep going if we're still in verbatim mode
            if (state.inVerbatim) continue;
        }

        // Inline transformations for code, bold, etc.
        line = processInlineElements(line);

        if (line.startsWith('=pod')) {
            // Handling =pod to start documentation
            continue; // Generally, we just skip this.
        } else if (line.startsWith('=head')) {
            // Headings
            const output = processHeadings(line);

            if (/\w/.test(finalMarkdown) || !/^\n##+ NAME\n$/.test(output)) {
                // I find it a waste of space to include the headline "NAME". We're short on space in the hover
                finalMarkdown += output;
            }
        } else if (
            // List markers and items
            line.startsWith('=over') ||
            line.startsWith('=item') ||
            line.startsWith('=back') ||
            state.waitingForListTitle
        ) {
            state = processList(line, state);
            finalMarkdown += state.markdown;
        } else if (line.startsWith('=begin') || line.startsWith('=end')) {
            // Custom blocks like =begin and =end
            state = processCustomBlock(line, state);
            finalMarkdown += state.markdown;
        } else if (line.startsWith('=for')) {
            // Format-specific blocks like =for
            finalMarkdown += processFormatSpecificBlock(line);
        } else if (line.startsWith('=encoding')) {
            // Encoding
            state = processEncoding(line, state);
        } else if (state.inList) {
            if (line) {
                finalMarkdown += ` ${line} `;
            }
        } else {
            // Generic text
            finalMarkdown += `${line}\n`;
        }
    }

    return finalMarkdown;
};

const processHeadings = (line: string): string => {
    // Extract the heading level from the line. This will be a number from 1-6.
    let level = parseInt(line.slice(5, 6));
    level = Math.min(level, 3); // Maximum 6 indentation levels in Markdown
    // Ensure that the heading level is valid.
    if (isNaN(level) || level < 1 || level > 6) {
        return '';
    }

    // Extract the actual text of the heading, which follows the =head command.
    const text = line.slice(7).trim();

    // Convert the heading to its Markdown equivalent. I marked head1 -> ### because I prefer the compact form.
    const markdownHeading = `\n##${'#'.repeat(level)} ${text}\n`;

    return markdownHeading;
};

const processList = (line: string, state: ConversionState): ConversionState => {
    let markdown = '';

    if (line.startsWith('=over')) {
        // The =over command starts a list.
        state.inList = true;
        markdown = '\n';
    } else if (/^=item \*\s*$/.test(line)) {
        // The =item command denotes a list item.
        state.waitingForListTitle = true;
        markdown = '';
    } else if (state.waitingForListTitle && /[^\s]/.test(line)) {
        state.waitingForListTitle = false;
        markdown = `\n- ${line}  \n  `;
    } else if (line.startsWith('=item')) {
        // The =item command denotes a list item.
        state.inList = true;

        // Remove the '=item' part to get the actual text for the list item.
        let listItem = line.substring(6).trim();
        if (listItem.startsWith('* '))
            // Doubled up list identifiers
            listItem = listItem.replace('*', '');
        markdown = `\n- ${listItem}  \n  `; // Unordered list
    } else if (line.startsWith('=back')) {
        // The =back command ends the list.
        state.inList = false;
        markdown = '\n';
    }

    return {
        ...state,
        markdown
    };
};

const processCustomBlock = (line: string, state: ConversionState): ConversionState => {
    let markdown = '';

    if (line.startsWith('=begin')) {
        // =begin starts a custom block
        // Extract the format following =begin
        const format = line.slice(7).trim();
        state.inCustomBlock = true;

        // Choose Markdown representation based on the format
        switch (format) {
            case 'code':
                markdown = '```perl\n';
                break;
            // Add cases for other formats as needed
            default:
                markdown = `<!-- begin ${format} -->\n`;
                break;
        }
    } else if (line.startsWith('=end')) {
        // =end ends the custom block
        // Extract the format following =end
        const format = line.slice(5).trim();
        state.inCustomBlock = false;

        // Close the Markdown representation
        switch (format) {
            case 'code':
                markdown = '```\n';
                break;
            // Add cases for other formats as needed
            default:
                markdown = `<!-- end ${format} -->\n`;
                break;
        }
    }

    return {
        ...state,
        markdown
    };
};

const processFormatSpecificBlock = (line: string): string => {
    // The `=for` command itself is followed by the format and then the text.
    const parts = line.split(' ').slice(1);

    if (parts.length < 2) {
        return '';
    }

    // Extract the format and the actual text.
    const format = parts[0].trim();
    const text = parts.slice(1).join(' ').trim();

    // Choose the Markdown representation based on the format.
    let markdown = '';
    switch (format) {
        case 'text':
            // Plain text, just add it.
            markdown = `${text}\n`;
            break;
        case 'html':
            // If it's HTML, encapsulate it within comments for safety.
            markdown = `<!-- HTML: ${text} -->\n`;
            break;
        // Add more cases as you find the need for other specific formats.
        default:
            // For unsupported or custom formats, wrap it in a comment.
            markdown = `<!-- ${format} block: ${text} -->\n`;
            break;
    }

    return markdown;
};

// Mapping backticks to the Unicode non-character U+FFFF which is not allowed to appear in text
const tempPlaceholder = '\uFFFF';

const processInlineElements = (line: string): string => {
    line = line.replaceAll('`', tempPlaceholder);

    // WWW::Mechanize is a good test for this one. Code blocks with embedded link
    line = line.replace(/C<([^<>]*)L<< (?:.+?\|\/?)?(.+?) >>([^<>]*)>/g, 'C<< $1 $2 $3 >>');

    // Handle code (C<code>), while allowing E<> replacements
    line = line.replace(/C<((?:[^<>]|[EL]<[^<>]+>)+?)>/g, (_match, code: string) => escapeBackticks(code));

    // Unfortunately doesn't require the <<< to be matched in quantity. E<> is allowed automatically
    line = line.replace(/C<< (.+?) >>/g, (_match, code: string) => escapeBackticks(code));
    line = line.replace(/C<<<+ (.+?) >+>>/g, (_match, code: string) => escapeBackticks(code));

    // Handle special characters (E<entity>)
    line = line.replace(/E<([^>]+)>/g, (_match, entity: string) => convertE(entity));

    // Mapping the Unicode non-character U+FFFF back to escaped backticks
    line = line.replace(new RegExp(tempPlaceholder, 'g'), '\\`');

    // Handle bold (B<bold>)
    line = line.replace(/B<([^<>]+)>/g, '**$1**');
    line = line.replace(/B<< (.+?) >>/g, '**$1**');

    // Handle italics (I<italic>)
    line = line.replace(/I<([^<>]+)>/g, '*$1*');
    line = line.replace(/I<< (.+?) >>/g, '*$1*');

    // Handle links (L<name>), URLS auto-link in vscode's markdown
    line = line.replace(/L<(http[^>]+)>/g, ' $1 ');

    line = line.replace(/L<([^<>]+)>/g, '`$1`');
    line = line.replace(/L<< (.*?) >>/g, '`$1`');

    // Handle non-breaking spaces (S<text>)
    line = line.replace(/S<([^<>]+)>/g, '$1');

    // Handle file names (F<name>), converting to italics
    line = line.replace(/F<([^<>]+)>/g, '*$1*');

    // Handle index entries (X<entry>), ignoring as Markdown doesn't have an index
    line = line.replace(/X<([^<>]+)>/g, '');

    // Escape HTML entities last since we use them above
    line = escapeHTML(line);

    return line;
};

// $& means the whole matched string
const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHTML = (str: string): string => {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '\\\\': '\\', // Two backslashes become one

        // These are required for the regex to consume & to ensure they don't get mapped to amp style.
        '\\&': '\\&',
        '\\<': '\\<',
        '\\"': '\\"',
        "\\'": "\\'"
    };

    // If the number of backticks is odd, it means backticks are unbalanced
    const backtickCount = (str.match(/`/g) ?? []).length;
    const segments = str.split('`');

    if (backtickCount % 2 !== 0 || segments.length % 2 === 0) {
        // Handle the unbalanced backticks here
        str = str.replaceAll('`', '');
    }

    // Escape special characters and create a regex pattern
    const pattern = new RegExp(Object.keys(map).map(escapeRegExp).join('|'), 'g');

    for (let i = 0; i < segments.length; i += 2) {
        segments[i] = segments[i].replace(pattern, (m) => map[m]);
    }

    return segments.join('`');
};

const escapeBackticks = (str: string): string => {
    const count = (str.match(new RegExp(tempPlaceholder, 'g')) ?? []).length;
    str = str.replace(new RegExp(tempPlaceholder, 'g'), '`'); // Backticks inside don't need to be escaped.
    const delimiters = '`'.repeat(count + 1);
    return `${delimiters}${str}${delimiters}`;
};

const convertE = (content: string): string => {
    switch (content) {
        case 'lt':
            return '<';
        case 'gt':
            return '>';
        case 'verbar':
            return '|';
        case 'sol':
            return '/';
        default:
            if (/^0x[\da-fA-F]+$/.test(content)) {
                return String.fromCodePoint(parseInt(content.substring(2), 16));
            } else if (/^0[0-7]+$/.test(content)) {
                return String.fromCodePoint(parseInt(content.substring(1), 8));
            } else if (/^\d+$/.test(content)) {
                return String.fromCodePoint(parseInt(content, 10));
            } else {
                return `&${content};`;
            }
    }
};

// Determine if the line should start a verbatim text block
const shouldConsiderVerbatim = (line: string): boolean => {
    // A verbatim block starts with a whitespace but isn't part of a list
    return /^\s+/.test(line);
};

// Process verbatim text blocks
const processVerbatim = (line: string, state: ConversionState): ConversionState => {
    let markdown = '';
    if (/^\s+/.test(line)) {
        // If this is the start of a new verbatim block, add Markdown code fence
        if (!state.inVerbatim) {
            markdown += '\n```\n';
        }
        state.inVerbatim = true;

        // Trim some starting whitespace and add the line to the block
        // Most pod code has 4 spaces or a tab, but I find 2 space indents most readable in the space constrained pop-up
        markdown += line.replace(/^(?:\s{4}|\t)/, '  ') + '\n';
    } else if (state.inVerbatim) {
        // This line ends the verbatim block
        state.inVerbatim = false;
        markdown += '```\n'; // End the Markdown code fence
    }

    return {
        ...state,
        markdown
    };
};

const processEncoding = (line: string, state: ConversionState): ConversionState => {
    // Extract the encoding type from the line
    const encodingType = line.split(' ')[1]?.trim();

    if (encodingType) {
        return {
            ...state,
            encoding: encodingType
        };
    }

    return state;
};
