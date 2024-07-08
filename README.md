# PG Language Server

Provides syntax checking, autocompletion, perlcritic, code navigation, and hover for PG problem files for the WeBWorK
online homework system. See (openwebwork)[https://github/openwebwork].

Implemented as a Language Server using the Microsoft LSP libraries along with Perl doing the syntax checking and
parsing.

## Currently Implemented Features

- Code formatting via pg-perltidy.pl

## Features Yet to be Implemented

- Syntax Checking
- PG Perl Critic static code analysis/suggestions
- Documentation on hover and autocomplete
- Subroutine signatures
- Code Navigation ("Go To Definition") anywhere, including macro files and pg library modules
- Outline view
- Smart context-aware autocompletion and navigation
- Hover for more details about objects, subs, and modules

### Perl paths

If you have a nonstandard install of Perl, please set the setting `pg.perlPath`. The subfolder `./lib` will be added to
your path automatically. You can also add additional include paths that will be added to the perl search path (@INC) via
`pg.includePaths`. You can use $workspaceFolder in includePaths which will be replaced by the full folder path. If you
have a multi-root workspace, each folder will be added to the path.

### Perl Critic Customization

You should specify a Perl::Critic profile via `pg.perlcriticProfile`. You can use `$workspaceFolder` as a place holder.
If `pg.perlcriticProfile` is not set, it will check for `~./perlcriticrc`. If that also does not exist, a default
profile will be used. The profile with default severity 4 is recommended, but you can change `pg.perlcritic.severity1`
through `pg.perlcritic.severity5`. Allowable options are error, warning, info, and hint.

### Perl Tidy Customization

Set `pg.pgPerltidyProfile` if you would like customized formatting. You can use `$workspaceFolder` as a place holder.
Otherwise, the default PG `.pg-perlcricic` profile will be used.

### Building from source

To build from source execute the following commands:

```sh
git clone https://github.com/drgrice1/pg-language-server
cd pg-language-server
npm ci
npm run compile
```

### Vim (via coc.nvim)

The configuration can be added directly to coc-settings (`:CocConfig`) like the following:

```json
{
 "languageserver": {
  "pglanguageserver": {
   "command": "node",
   "args": ["/path/to/pg-language-server/server/dist/server.js", "--stdio"],
   "filetypes": ["pg"]
  }
 }
}
```

Alternately, the `coc.nvim` client extension can be used, simplifying overall configuration. A simple configuration to
enable the PG language server via the `coc.nvim` extension (`:CocInstall coc-pg`), looks like:

```json
{
 "coc-pg.enable": true,
 "pg.pgPerltidyProfile": "/path/to/pg-language-server/server/dist/server.js"
}
```

## Vscode Installation

Hmm...

## Licenses / Acknowledgments

The Perl Language Server is free software licensed under the MIT License. This work is largely based the
`PerlNavigator` and `coc-perl` projects.
