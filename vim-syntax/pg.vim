" Vim syntax file
" Language:	  PG (WeBWorK problem file)
" Maintainer: Glenn Rice <grice1@missouriwestern.edu>
" License:    Vim License (see :help license)

if exists("b:current_syntax")
	finish
endif

runtime! syntax/perl.vim
unlet b:current_syntax

syn sync fromstart

syn match pgSpecialString "\~\~\%(\o\{1,3}\|x\%({\x\+}\|\x\{1,2}\)\|c.\|[^cx]\)" contained extend
syn cluster perlInterpDQ remove=perlSpecialString
syn cluster perlInterpDQ add=pgSpecialString

hi def bold term=bold cterm=bold gui=bold
hi def italic term=italic cterm=italic gui=italic
hi def boldItalic term=bold,italic cterm=bold,italic gui=bold,italic
hi def trailingWhitespace ctermbg=176 guibg=#d787d7

hi def link pgSpecialString PreProc

" PGML
syn region pgmlPerlCommand matchgroup=PreProc start=/\[@/ end=/@\]\*\{0,3}/ contained contains=@perlTop
syn region pgmlPerlVariable matchgroup=PreProc start=/\[\$\@=/ end=/\]\*\{0,3}/
            \ contained contains=perlVarPlain,perlNumber,perlOperator
syn region pgmlOption matchgroup=PreProc nextgroup=pgmlOption start=/{/ end=/}/ contained contains=@perlTop
syn match pgmlAnswer /\[_*\]\*\?/ nextgroup=pgmlOption contained
syn region pgmlComment start=/\[%/ end=/%\]/ contained contains=pgmlComment,@Spell
syn region pgmlMathMode matchgroup=PreProc start=/\[`/ end=/`\]/ contained contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlMathMode matchgroup=PreProc start=/\[``/ end=/``\]/ contained contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlMathMode matchgroup=PreProc start=/\[```/ end=/```\]/ contained contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlParsed matchgroup=PreProc nextgroup=pgmlOption start=/\[:/ end=/:\]\*\{0,3}/ contained
            \ contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlParsed matchgroup=PreProc nextgroup=pgmlOption start=/\[::/ end=/::\]\*\{0,3}/ contained
            \ contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlParsed matchgroup=PreProc nextgroup=pgmlOption start=/\[:::/ end=/:::\]\*\{0,3}/ contained
            \ contains=pgmlPerlCommand,pgmlPerlVariable
syn region pgmlImage matchgroup=PreProc nextgroup=pgmlOption start=/\[\!/ end=/\!\]/ contained
            \ contains=pgmlPerlCommand,pgmlPerlVariable,@Spell
syn region pgmlTag matchgroup=PreProc nextgroup=pgmlOption start=/\[</ end=/>\]/ contained contains=@pgmlAll,@Spell
syn region pgmlBold matchgroup=PreProc start=/\*\w\@=/ end=/\*/ contained contains=@pgmlBase,pgmlItalic,@Spell
syn region pgmlItalic matchgroup=PreProc start=/\w\@<!_\w\@=/ end=/_/ contained contains=@pgmlBase,pgmlBold,@Spell
syn region pgmlBoldItalic matchgroup=PreProc start=/\w\@<!_\*\w\@=/ end=/\*_/ contained contains=@pgmlBase,@Spell
syn region pgmlBoldItalic matchgroup=PreProc start=/\w\@<!\*_\w\@=/ end=/_\*/ contained contains=@pgmlBase,@Spell
syn region pgmlVerbatim matchgroup=PreProc start=/\[|/ end=/|\]\*\?/ contained contains=perlCharacter
syn region pgmlVerbatim matchgroup=PreProc start=/\[||/ end=/||\]\*\?/ contained contains=perlCharacter
syn match pgmlEscape /\\[\\\[\]`*_{}()<>#+.!-"]/ contained
syn match pgmlRule /\(-\{3,}\)\|\(=\{3,}\)/ nextgroup=pgmlOption contained
syn region pgmlTable matchgroup=PreProc start=/\[#/ end=/#\]\*\?/ nextgroup=pgmlOption
            \ contained contains=pgmlTableCell,pgmlComment
syn region pgmlTableCell matchgroup=PreProc start=/\[\./ end=/\.\]\*\?/ nextgroup=pgmlOption contained
            \ contains=@pgmlAll,@Spell
syn region pgmlHeader1 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=##\@!/
            \ end=/#\@<!#\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn region pgmlHeader2 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=###\@!/
            \ end=/#\@<!##\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn region pgmlHeader3 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=####\@!/
            \ end=/#\@<!###\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn region pgmlHeader4 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=#####\@!/
            \ end=/#\@<!####\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn region pgmlHeader5 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=######\@!/
            \ end=/#\@<!#####\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn region pgmlHeader5 matchgroup=Delimiter
            \ start=/\(^\(>> *\)\?\)\@<=#######\@!/
            \ end=/#\@<!######\(\(\( \{2,3}$\)\@=\)\|\( *<<$\)\@=\|$\)\|\( \@<! \{,3}<<$\)\@=\|\n\(>>\| \{4}\)\@=\|\n\n/
            \ contained contains=@pgmlAll,@Spell
syn match pgmlAlignment /^>>/
syn match pgmlCenter /<<\( \{2,3}\)\?$/
syn match pgmlPreformatted /^\(\( \{4}\)\|\t\)*: \{3}/
syn region pgmlCode matchgroup=PreProc start=/^```/ end=/```/ nextgroup=pgmlCodeClass contained
            \ contains=pgmlCodeClass,Character
syn match pgmlCodeClass /\(^```\)\@<=[a-z0-9]\+$/
syn match pgmlTrailingWhitespace /[ \t]\+$/
syn match pgmlUnorderedListMarker /^\(\t\| \{4\}\)*[-*+o]\s\@=/ contained
syn match pgmlOrderedListMarker /^\(\t\| \{4\}\)*\(\d\+\|[ivxl]\+\|[IVXL]\+\|[a-zA-Z]\)[.)]\s\@=/ contained

syn cluster pgmlBase contains=
            \ pgmlPerlCommand,
            \ pgmlPerlVariable,
            \ pgmlAnswer,
            \ pgmlComment,
            \ pgmlMathMode,
            \ pgmlParsed,
            \ pgmlImage,
            \ pgmlTag,
            \ pgmlVerbatim,
            \ pgmlEscape,
            \ pgmlRule,
            \ pgmlTable,
            \ pgmlTrailingWhitespace

syn cluster pgmlAll contains=
            \ @pgmlBase,
            \ pgmlBold,
            \ pgmlItalic,
            \ pgmlBoldItalic,
            \ pgmlHeader1,
            \ pgmlHeader2,
            \ pgmlHeader3,
            \ pgmlHeader4,
            \ pgmlHeader5,
            \ pgmlHeader6,
            \ pgmlAlignment,
            \ pgmlCenter,
            \ pgmlPreformatted,
            \ pgmlCode,
            \ pgmlUnorderedListMarker,
            \ pgmlOrderedListMarker

syn region pgml matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_PGML[ \t;]*$/ end=/^[ \t]*END_PGML[ \t;]*$/
            \ fold contains=@pgmlAll,@Spell
syn region pgml matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_PGML_SOLUTION[ \t;]*$/ end=/^[ \t]*END_PGML_SOLUTION[ \t;]*$/
            \ fold contains=@pgmlAll,@Spell
syn region pgml matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_PGML_HINT[ \t;]*$/ end=/^[ \t]*END_PGML_HINT[ \t;]*$/
            \ fold contains=@pgmlAll,@Spell

hi def link pgmlAnswer Character
hi def link pgmlComment Comment
hi def link pgmlMathMode Character
hi def link pgmlParsed Character
hi def link pgmlBold bold
hi def link pgmlItalic italic
hi def link pgmlBoldItalic boldItalic
hi def link pgmlEscape PreProc
hi def link pgmlRule PreProc
hi def link pgmlTrailingWhitespace trailingWhitespace
hi def link pgmlHeader1 Title
hi def link pgmlHeader2 Title
hi def link pgmlHeader3 Title
hi def link pgmlHeader4 Title
hi def link pgmlHeader5 Title
hi def link pgmlHeader6 Title
hi def link pgmlAlignment PreProc
hi def link pgmlCenter PreProc
hi def link pgmlPreformatted PreProc
hi def link pgmlCodeClass PreProc
hi def link pgmlUnorderedListMarker Statement
hi def link pgmlOrderedListMarker Statement

" PG Text
syn region pgTextPerlCommand matchgroup=PreProc start=/\\{/ end=/\\}/ contained contains=@perlTop
syn region pgTextMathMode matchgroup=PreProc start=/\\(/ end=/\\)/ contained contains=pgTextPerlCommand,@perlInterpDQ
syn region pgTextMathMode matchgroup=PreProc start=/\\\[/ end=/\\\]/ contained contains=pgTextPerlCommand,@perlInterpDQ
syn region pgTextParsedMath matchgroup=PreProc
            \ start=/``\@!/ end=/`\@<!`\*\?/ contained contains=pgTextPerlCommand,@perlInterpDQ
syn region pgTextDisplayParsedMath matchgroup=PreProc
            \ start=/``/ end=/``\*\?/ contained contains=pgTextPerlCommand,@perlInterpDQ

syn cluster pgTextAll
            \ contains=pgTextPerlCommand,pgTextMathMode,pgTextParsedMath,pgTextDisplayParsedMath,@perlInterpDQ,@Spell

syn region pgText matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_TEXT[ \t;]*$/ end=/^[ \t]*END_TEXT[ \t;]*$/
            \ fold contains=@pgTextAll
syn region pgText matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_SOLUTION[ \t;]*$/ end=/^[ \t]*END_SOLUTION[ \t;]*$/
            \ fold contains=@pgTextAll
syn region pgText matchgroup=Keyword keepend
            \ start=/^[ \t]*BEGIN_HINT[ \t;]*$/ end=/^[ \t]*END_HINT[ \t;]*$/
            \ fold contains=@pgTextAll

hi def link pgTextMathMode Character
hi def link pgTextParsedMath Character
hi def link pgTextDisplayParsedMath Character

" TiKZ and LaTeX image code
syn region tikz matchgroup=Identifier
            \ start=/\(^.*->\)\@<=BEGIN_TIKZ[ \t;]*$/ end=/^[ \t]*END_TIKZ[ \t;]*$/
            \ fold contains=@perlInterpDQ
syn region tikz matchgroup=Identifier
            \ start=/\(^.*->\)\@<=BEGIN_LATEX_IMAGE[ \t;]*$/ end=/^[ \t]*END_LATEX_IMAGE[ \t;]*$/
            \ fold contains=@perlInterpDQ

hi def link tikz String

let b:current_syntax = "pg"

" vim:ts=4:sts=4:sw=4:expandtab:ft=vim
