# PG Language Server

Provides syntax checking, autocompletion, perlcritic, code navigation, and hover for PG problem files for the WeBWorK
online homework system. See [openwebwork](https://github.com/openwebwork).

Implemented as a Language Server using the Microsoft LSP libraries along with Perl doing the syntax checking and
parsing.

## Currently Implemented Features

- Code formatting via pg-perltidy.pl
- PG Perl Critic static code analysis/suggestions
- Syntax Checking

## Features Yet to be Implemented

- Documentation on hover and autocomplete
- Subroutine signatures
- Code Navigation ("Go To Definition") anywhere, including macro files and pg library modules
- Outline view
- Smart context-aware autocompletion and navigation
- Hover for more details about objects, subs, and modules

### Perl paths

If you have an installation of Perl at a nonstandard location, please set the `pg.perlPath` setting. You can also add
additional include paths that will be added to the Perl search path (@INC) via `pg.includePaths`. You can use
`$workspaceFolder` in `pg.includePaths` which will be replaced by the full folder path.

### Perl Critic Customization

You can specify a Perl::Critic profile via `pg.perlcriticProfile`. You can use `$workspaceFolder` as a place holder in
the value of this variable. If `pg.perlcriticProfile` is not set, then a `~./.pg-perlcriticrc` file will be used if
found. If that also does not exist, the default pg perlcritic profile will be used. This default profile with perlcritic
severity 4 is recommended, but you can change `pg.perlcriticSeverity` if desired. Allowable options are error, warning,
info, and hint. The default diagnostic severity (used for coloring the squiggly underlines) is reasonable, but you can
change `pg.severity1` through `pg.severity5`. Allowable options are error, warning, info, and hint.

### Perl Tidy Customization

Set `pg.perltidyProfile` if you would like customized formatting. You can use `$workspaceFolder` as a place holder in
the value of this variable. Otherwise, the
[`perltidy-pg.rc`](https://github.com/openwebwork/pg/blob/main/bin/perltidy-pg.rc) profile from the PG repository will
be used.

### Build From Source

To build from source execute the following commands:

```sh
git clone https://github.com/drgrice1/pg-language-server
cd pg-language-server
git submodule init
git submodule update
npm ci
npm run build
```

### Install Runtime Dependencies

In order for the `pg-perldity.pl` script to work the following Perl dependencies are needed. Note that the
`pg-perltidy.pl` script is part of the PG repository that was cloned when the git submodules were initialized above.

- Perl::Tidy
- Mojolicious
- PPI
- Perl::Critic

### Vim Installation (via coc.nvim)

The configuration can be added directly to the `coc-settings.json` file (open with `:CocConfig` in vim) like the
following:

```json
{
 "languageserver": {
  "pg": {
   "command": "node",
   "args": ["/path/to/pg-language-server/dist/server.js", "--stdio"],
   "filetypes": ["pg"]
  }
 }
}
```

Then add `autocmd BufRead,BufNewFile *.pg setlocal filetype=pg` to your `.vimrc` file.

Alternately, the `coc.nvim` client extension can be used, simplifying overall configuration. To enable the `coc.nvim`
extension add `set runtimepath^=/path/to/pg-language-server/coc-client` to your `.vimrc` file. The extension can be
configured by adding settings to the `coc-settings.json` file (open with `:CocConfig` in vim) as in the following
example.

```json
{
 "coc-pg.enable": true,
 "pg.perltidyProfile": "$workspaceFolder/.perltidyrc"
}
```

## Vscode Installation

Follow the build instructions and install the runtime dependencies. Then either create a link from your vscode
extensions directory (`~/.vscode/extensions`) to the location of the `pg-language-server` clone, or move the clone into
the vscode extensions directory.

## Licenses / Acknowledgments

The Perl Language Server is free software licensed under the MIT License. This work is largely based the
`PerlNavigator` and `coc-perl` projects.
