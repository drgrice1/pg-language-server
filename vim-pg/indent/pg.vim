" Vim indent file
" Language:    PG (WeBWorK problem file)
" Maintainer:  Glenn Rice <grice1@missouriwestern.edu>
" License:     Vim License (see :help license)
" Homepage:    https://github.com/drgrice1/pg-language-server
" Last Change: October 15, 2024

" TODO things that are not or not properly indented (yet) :
" - Continued statements
"     print "foo",
"       "bar";
"     print "foo"
"       if bar();
" - Multiline regular expressions (m//x)
" (The following probably needs modifying the pg syntax file)
" - qw() lists
" - Heredocs with terminators that don't match \I\i*

" Only load this indent file when no other was loaded.
if exists("b:did_indent")
    finish
endif
let b:did_indent = 1

" Is syntax highlighting active?
let b:indent_use_syntax = has("syntax")

setlocal indentexpr=GetPgIndent()
setlocal indentkeys+=0=,0),0],0=or,0=and,0=>],0=.],0=#],0=@],0=`],0=``],0=```],0=:],0=::],0=:::],0=%],0=\\},0=\\],0=\\)

let b:undo_indent = "setl inde< indk<"

let s:cpo_save = &cpo
set cpo-=C

function! GetPgIndent()
    " Get the line to be indented
    let cline = getline(v:lnum)

    let csyn_region = 'perl'
    for id in reverse(synstack(v:lnum, 1))
        let synname = synIDattr(id, 'name')
        if synname =~ '^pgml' | let csyn_region = 'pgml' | break | endif
        if synname =~ '^pgText' | let csyn_region = 'pgText' | break | endif
        if (synname =~ '^perl' || synname == 'pgProblemTextBlockStartEnd') | break | endif
    endfor

    " Indent POD markers to 0.
    if cline =~ '^\s*=\L\@!' && csyn_region == 'perl'
        return 0
    endif

    " Get the current syntax item at the beginning of the line.
    let csynid = ''
    if b:indent_use_syntax
        let csynid = synIDattr(synID(v:lnum, 1, 0), "name")
    endif

    " Don't reindent POD and heredocs.
    if csynid == "perlPOD" || csynid == "perlHereDoc" || csynid =~ "^pod"
        return indent(v:lnum)
    endif

    " Indent heredocs end markers to 0.
    if b:indent_use_syntax
        " Assumes that an end-of-heredoc marker matches \I\i* to avoid
        " confusion with other types of strings
        if csynid == "perlStringStartEnd" && cline =~ '^\I\i*$'
            return 0
        endif
    endif

    " Find a non-blank line above the current line.
    let lnum = prevnonblank(v:lnum - 1)
    " If the start of the file is reached, then use zero indent.
    if lnum == 0
        return 0
    endif
    let line = getline(lnum)
    " Get the indent of the previous line.
    let ind = indent(lnum)

    " Skip heredocs, POD, and comments at the beginning of a line.
    if b:indent_use_syntax
        let skippin = 2
        while skippin
            let synid = synIDattr(synID(lnum, 1, 0), "name")
            if (synid == "perlStringStartEnd" && line =~ '^\I\i*$')
                        \ || (skippin != 2 && (synid == "perlPOD" || synid == "perlHereDoc"))
                        \ || synid == "perlComment"
                        \ || synid =~ "^pod"
                let lnum = prevnonblank(lnum - 1)
                if lnum == 0
                    return 0
                endif
                let line = getline(lnum)
                let ind = indent(lnum)
                let skippin = 1
            else
                let skippin = 0
            endif
        endwhile
    endif

    " Indent blocks enclosed by {}, (), or [].
    if b:indent_use_syntax
        let delimiterClass = '[][(){}]'
        let endDelimiter = csyn_region == 'pgml' ? '^\s*\(\([>#.@%]\|`\{1,3}\|:\{1,3}\)\]\|[)}]\)'
                    \ : csyn_region == 'pgText' ? '^\s*\\\?[])}]'
                    \ : '^\s*[])}]'
        let delimiterPos = match(line, delimiterClass, matchend(line, endDelimiter))
        let increaseIndent = 0
        while delimiterPos != -1
            let synid = synIDattr(synID(lnum, delimiterPos + 1, 0), "name")
            if synid == ""
                        \ || synid == "perlMatchStartEnd"
                        \ || synid == "perlHereDoc"
                        \ || synid == "perlDelimiter"
                        \ || synid == "perlStatementIndirObj"
                        \ || synid == "perlSubDeclaration"
                        \ || synid =~ '^perl\(Sub\|Block\|Package\)Fold'
                        \ || synid =~ '^pgmlOption'
                        \ || synid == "pgmlBlockStartEnd"
                        \ || synid =~ '^pgmlPerlCommand'
                        \ || synid == "pgmlCommentStartEnd"
                        \ || synid == "pgmlMathStartEnd"
                        \ || synid == "pgTextCommandStartEnd"
                        \ || synid == "pgTextMathStartEnd"
                let delimiter = strpart(line, delimiterPos, 1)
                if delimiter == '(' || delimiter == '{' || delimiter == '['
                    let increaseIndent = increaseIndent + 1
                else
                    let increaseIndent = increaseIndent - 1
                endif
            endif
            let delimiterPos = match(line, delimiterClass, delimiterPos + 1)
        endwhile
        let delimiterPos = matchend(cline, endDelimiter)
        if delimiterPos != -1
            let synid = synIDattr(synID(v:lnum, delimiterPos, 0), "name")
            if synid == ""
                        \ || synid == "perlMatchStartEnd"
                        \ || synid == "perlDelimiter"
                        \ || synid == "perlStatementIndirObj"
                        \ || synid =~ '^perl\(Sub\|Block\|Package\)Fold'
                        \ || synid =~ '^pgmlOption'
                        \ || synid =~ '^pgmlPerlCommand'
                        \ || synid == "pgmlBlockStartEnd"
                        \ || synid == "pgmlCommentStartEnd"
                        \ || synid == "pgmlMathStartEnd"
                        \ || synid == "pgTextCommandStartEnd"
                        \ || synid == "pgTextMathStartEnd"
                let increaseIndent = increaseIndent - 1
            endif
        endif
        if increaseIndent > 0
            let ind = ind + shiftwidth()
        elseif increaseIndent < 0
            let ind = ind - shiftwidth()
        endif
    else
        if line =~ '[{[(]\s*\(#[^])}]*\)\=$'
            let ind = ind + shiftwidth()
        endif
        if cline =~ '^\s*[])}]'
            let ind = ind - shiftwidth()
        endif
    endif

    if csyn_region != 'perl' | return ind | endif

    " Indent lines that begin with 'or' or 'and'.
    if cline =~ '^\s*\(or\|and\)\>'
        if line !~ '^\s*\(or\|and\)\>'
            let ind = ind + shiftwidth()
        endif
    elseif line =~ '^\s*\(or\|and\)\>'
        let ind = ind - shiftwidth()
    endif

    return ind

endfunction

let &cpo = s:cpo_save
unlet s:cpo_save

" vim:ts=4:sts=4:sw=4:expandtab:ft=vim
