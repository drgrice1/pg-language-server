" Vim syntax file
" Language:    PG (WeBWorK problem file)
" Maintainer:  Glenn Rice <grice1@missouriwestern.edu>
" License:     Vim License (see :help license)
" Homepage:    https://github.com/drgrice1/pg-language-server
" Last Change: October 15, 2024

" The following parameters are available for tuning the pg syntax highlighting. By default all are unset.
" pg_minlines - The minimum number of lines to look back when syncing. If unset will sync from the first line.
" pg_include_pod - Set to 1 to include the pod.vim syntax.
" pg_perl_fold - Set to 1 to enable code folding of perl code sections.
" pg_fold_blocks - Also fold code blocks.  Only has effect if pg_perl_fold is 1. (Doesn't work very well.)
" pg_fold_do_blocks - Only fold `do` blocks.  Only has effect if pg_perl_fold is 1 and pg_fold_blocks is 0.
"                     (Also doesn't work very well).
" pg_nofold_packages - If pg_perl_fold is 1, then don't fold `package` segments of the code.
" pg_nofold_subs - If pg_perl_fold is 1, then don't fold `sub` definitions.
" pg_fold_anonymous_subs - If pg_perl_fold is 1 and pg_nofold_subs is 0, then also fold anonymous `sub` definitions.

" Note that folding of PGML, PG text, TIKZ, and LATEX_IMAGE blocks is always enabled if `foldmethod=syntax`.

if exists("b:current_syntax")
    finish
endif

let s:cpo_save = &cpo
set cpo&vim

if get(g:, 'pg_include_pod', 0)
    " Include a while extra syntax file
    syn include @Pod syntax/pod.vim
    unlet b:current_syntax
    if get(g:, 'pg_perl_fold', 0)
        syn region perlPOD start="^=[a-z]" end="^=cut" contains=@Pod,@Spell,perlTodo keepend fold extend
        syn region perlPOD start="^=cut" end="^=cut" contains=perlTodo keepend fold extend
    else
        syn region perlPOD start="^=[a-z]" end="^=cut" contains=@Pod,@Spell,perlTodo keepend
        syn region perlPOD start="^=cut" end="^=cut" contains=perlTodo keepend
    endif
else
    " Use only the bare minimum of rules
    if get(g:, 'pg_perl_fold', 0)
        syn region perlPOD start="^=[a-z]" end="^=cut" fold
    else
        syn region perlPOD start="^=[a-z]" end="^=cut"
    endif
endif

syn cluster pgTop contains=TOP

syn region perlBraces start="{" end="}" transparent extend

" All keywords

syn match perlConditional "\<\%(if\|elsif\|unless\|given\|when\|default\)\>"
syn match perlConditional "\<else\%(\%(\_s\*if\>\)\|\>\)" contains=perlElseIfError skipwhite skipnl skipempty
syn match perlRepeat "\<\%(while\|for\%(each\)\?\|do\|until\|continue\)\>"
syn match perlOperator "\<\%(defined\|undef\|eq\|ne\|[gl][et]\|cmp\|not\|and\|or\|xor\|not\|bless\|ref\|do\)\>"
" for some reason, adding this as the nextgroup for perlControl fixes BEGIN folding issues...
syn match perlFakeGroup "" contained
syn match perlControl "\<\%(BEGIN\|CHECK\|INIT\|END\|UNITCHECK\)\>\_s*" nextgroup=perlFakeGroup

syn match perlStatementStorage "\<\%(my\|our\|local\|state\)\>"
syn match perlStatementControl "\<\%(return\|last\|next\|redo\|goto\|break\)\>"
syn match perlStatementScalar
            \ "\<\%(chom\?p\|chr\|crypt\|r\?index\|lc\%(first\)\?\|length\|ord\|pack\|sprintf\|substr\|fc\|uc\%(first\)\?\)\>"
syn match perlStatementRegexp "\<\%(pos\|quotemeta\|split\|study\)\>"
syn match perlStatementNumeric "\<\%(abs\|atan2\|cos\|exp\|hex\|int\|log\|oct\|rand\|sin\|sqrt\|srand\)\>"
syn match perlStatementList "\<\%(splice\|unshift\|shift\|push\|pop\|join\|reverse\|grep\|map\|sort\|unpack\)\>"
syn match perlStatementHash "\<\%(delete\|each\|exists\|keys\|values\)\>"
syn match perlStatementVector "\<vec\>"
syn match perlStatementFlow "\<\%(die\|eval\|wantarray\|evalbytes\)\>"
syn match perlStatementProc "\<\%(get\%(pgrp\|priority\)\|pipe\|set\%(pgrp\|priority\)\|times\)\>"
syn match perlStatementTime "\<\%(gmtime\|localtime\|time\)\>"
syn match perlStatementMisc "\<\%(warn\|format\|formline\|reset\|scalar\|prototype\|lock\|tied\?\|untie\)\>"

syn keyword perlTodo TODO TODO: TBD TBD: FIXME FIXME: XXX XXX: NOTE NOTE: contained

syn match perlLabel "^\s*\h\w*\s*::\@!\%(\<v\d\+\s*:\)\@<!"

" Perl Identifiers.

" Should be cleaned up to better handle identifiers in particular situations
" (in hash keys for example)

" Plain identifiers: $foo, @foo, $#foo, %foo, &foo and dereferences $$foo, @$foo, etc.
" We do not process complex things such as @{${"foo"}}. Too complicated, and
" too slow. And what is after the -> is *not* considered as part of the
" variable - there again, too complicated and too slow.

" Special variables first ($^A, ...) and ($|, $', ...)
syn match perlVarPlain "$^[ACDEFHILMNOPRSTVWX]\?"
syn match perlVarPlain "$\%([\"\[\]'&`+*.,;=%~!?@#$<>(-]\|\~\~\)"
syn match perlVarPlain "@[-+]"
syn match perlVarPlain "$\%(0\|[1-9]\d*\)"
" Same as above, but avoids confusion in $::foo (equivalent to $main::foo)
syn match perlVarPlain "$::\@!"
" These variables are not recognized within matches.
syn match perlVarNotInMatches "$[|)]"
" This variable is not recognized within matches delimited by m//.
syn match perlVarSlash "$/"

" And plain identifiers
syn match perlPackageRef "[$@#%*&]\%(\%(::\|'\)\?\I\i*\%(\%(::\|'\)\I\i*\)*\)\?\%(::\|'\)\I"ms=s+1,me=e-1 contained

syn match perlVarPlain "\%([@$]\|\$#\)\$*\%(\I\i*\)\?\%(\%(::\|'\)\I\i*\)*\%(::\|\i\@<=\)"
            \ contains=perlPackageRef nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref
syn match perlVarPlain2 "%\$*\%(\I\i*\)\?\%(\%(::\|'\)\I\i*\)*\%(::\|\i\@<=\)"
            \ contains=perlPackageRef nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref
syn match perlFunctionName "&\$*\%(\I\i*\)\?\%(\%(::\|'\)\I\i*\)*\%(::\|\i\@<=\)"
            \ contains=perlPackageRef nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref

syn match perlVarPlain2 "%[-+]"

syn cluster perlExpr contains=
            \ perlStatementScalar,
            \ perlStatementRegexp,
            \ perlStatementNumeric,
            \ perlStatementList,
            \ perlStatementHash,
            \ perlStatementTime,
            \ perlStatementMisc,
            \ perlVarPlain,
            \ perlVarPlain2,
            \ perlVarNotInMatches,
            \ perlVarSlash,
            \ perlVarBlock,
            \ perlVarBlock2,
            \ perlFloat,
            \ perlNumber,
            \ perlStringUnexpanded,
            \ perlString,
            \ perlQ,
            \ perlQQ,
            \ perlQW,
            \ perlQR,
            \ perlArrow,
            \ perlBraces
syn region perlArrow matchgroup=perlArrow start="->\s*(" end=")"
            \ contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref contained
syn region perlArrow matchgroup=perlArrow start="->\s*\[" end="\]"
            \ contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref contained
syn region perlArrow matchgroup=perlArrow start="->\s*{" end="}"
            \ contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref contained
syn match perlArrow "->\s*{\s*\I\i*\s*}"
            \ contains=perlVarSimpleMemberName nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref contained
syn region perlVarBlock matchgroup=perlVarPlain
            \ start="\%($#\|[$@]\)\$*{" skip="\~\~}" end=+}\|\%(\%(<<\%('\|"\)\?\)\@=\)+
            \ contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn region perlVarBlock2 matchgroup=perlVarPlain
            \ start="[%&*]\$*{" skip="\~\~}" end=+}\|\%(\%(<<\%('\|"\)\?\)\@=\)+
            \ contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn match perlVarPlain2 "[%&*]\$*{\I\i*}" nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn match perlVarPlain "\%(\$#\|[@$]\)\$*{\I\i*}" nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn region perlVarMember matchgroup=perlVarPlain
            \ start="\%(->\)\?{" skip="\~\~}" end="}"
            \ contained contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn match perlVarSimpleMember "\%(->\)\?{\s*\I\i*\s*}"
            \ nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref
            \ contains=perlVarSimpleMemberName contained extend
syn match perlVarSimpleMemberName "\I\i*" contained
syn region perlVarMember matchgroup=perlVarPlain
            \ start="\%(->\)\?\[" skip="\~\~]" end="]"
            \ contained contains=@perlExpr nextgroup=perlVarMember,perlVarSimpleMember,perlPostDeref extend
syn match perlPackageConst "__PACKAGE__" nextgroup=perlPostDeref
syn match perlPostDeref "->\%($#\|[$@%&*]\)\*" contained nextgroup=perlVarSimpleMember,perlVarMember,perlPostDeref
syn region perlPostDeref
            \ start="->\%($#\|[$@%&*]\)\[" skip="\~\~]" end="]"
            \ contained contains=@perlExpr nextgroup=perlVarSimpleMember,perlVarMember,perlPostDeref
syn region perlPostDeref matchgroup=perlPostDeref
            \ start="->\%($#\|[$@%&*]\){" skip="\~\~}" end="}"
            \ keepend extend contained contains=@perlExpr nextgroup=perlVarSimpleMember,perlVarMember,perlPostDeref

" Special characters in strings and matches
syn match perlSpecialString "\~\~\%(\o\{1,3}\|x\%({\x\+}\|\x\{1,2}\)\|c.\|[^cx]\)" contained extend
syn match perlSpecialStringU2 "\~\~." extend contained contains=NONE
syn match perlSpecialMatch "\~\~[1-9]" contained extend
syn match perlSpecialMatch "\~\~g\%(\d\+\|{\%(-\?\d\+\|\h\w*\)}\)" contained
syn match perlSpecialMatch "\~\~k\%(<\h\w*>\|'\h\w*'\)" contained
syn match perlSpecialMatch "{\d\+\%(,\%(\d\+\)\?\)\?}" contained
syn match perlSpecialMatch "\[[]-]\?[^\[\]]*[]-]\?\]" contained extend
syn match perlSpecialMatch "[+*()?.]" contained
syn match perlSpecialMatch "(?[#:=!]" contained
syn match perlSpecialMatch "(?[impsx]*\%(-[imsx]\+\)\?)" contained
syn match perlSpecialMatch "(?\%([-+]\?\d\+\|R\))" contained
syn match perlSpecialMatch "(?\%(&\|P[>=]\)\h\w*)" contained
syn match perlSpecialMatch
            \ "(\*\%(\%(PRUNE\|SKIP\|THEN\)\%(:[^)]*\)\?\|\%(MARK\|\):[^)]*\|COMMIT\|F\%(AIL\)\?\|ACCEPT\))" contained

" Possible errors
" Highlight lines with only whitespace (only in blank delimited here documents) as errors
syn match perlNotEmptyLine "^\s\+$" contained
" Highlight `} else if (...) {`, it should be `} else { if (...) { ` or `} elsif (...) {`
syn match perlElseIfError "else\_s*if" containedin=perlConditional
syn keyword perlElseIfError elseif containedin=perlConditional

" Variable interpolation
" These items are interpolated inside double quoted strings and similar constructs.
syn cluster perlInterpDQ contains=perlSpecialString,perlVarPlain,perlVarNotInMatches,perlVarSlash,perlVarBlock
" These items are interpolated inside single quoted strings and similar constructs.
syn cluster perlInterpSQ contains=perlSpecialStringU2
" These items are interpolated inside m// matches and s/// substitutions.
syn cluster perlInterpSlash contains=perlSpecialString,perlSpecialMatch,perlVarPlain,perlVarBlock
" These items are interpolated inside m## matches and s### substitutions.
syn cluster perlInterpMatch contains=@perlInterpSlash,perlVarSlash

" Numbers
syn case ignore
syn match perlNumber "\<\%(0\|[1-9]\%(_\?\d\)*\)\>"
syn match perlNumber "\<0\%(x\x\%(_\?\x\)*\|b[01]\%(_\?[01]\)*\|o\?\%(_\?\o\)*\)\>"
syn match perlFloat "\<\d\%(_\?\d\)*e[-+]\?\d\%(_\?\d\)*"
syn match perlFloat "\<\d\%(_\?\d\)*\.\%(\d\%(_\?\d\)*\)\?\%(e[-+]\?\d\%(_\?\d\)*\)\?"
syn match perlFloat "\.\d\%(_\?\d\)*\%(e[-+]\?\d\%(_\?\d\)*\)\?"
syn match perlFloat "\<0x\x\%(_\?\x\)*p[-+]\?\d\%(_\?\d\)*"
syn match perlFloat "\<0x\x\%(_\?\x\)*\.\%(\x\%(_\?\x\)*\)\?\%(p[-+]\?\d\%(_\?\d\)*\)\?"
syn match perlFloat "\<0x\.\x\%(_\?\x\)*\%(p[-+]\?\d\%(_\?\d\)*\)\?"
syn case match

syn match perlString "\<\%(v\d\+\%(\.\d\+\)*\|\d\+\%(\.\d\+\)\{2,}\)\>" contains=perlVStringV
syn match perlVStringV "\<v" contained

syn region perlParensSQ start=+(+ end=+)+ extend contained contains=perlParensSQ,@perlInterpSQ keepend
syn region perlBracketsSQ start=+\[+ end=+\]+ extend contained contains=perlBracketsSQ,@perlInterpSQ keepend
syn region perlBracesSQ start=+{+ end=+}+ extend contained contains=perlBracesSQ,@perlInterpSQ keepend
syn region perlAnglesSQ start=+<+ end=+>+ extend contained contains=perlAnglesSQ,@perlInterpSQ keepend

syn region perlParensDQ start=+(+ end=+)+ extend contained contains=perlParensDQ,@perlInterpDQ keepend
syn region perlBracketsDQ start=+\[+ end=+\]+ extend contained contains=perlBracketsDQ,@perlInterpDQ keepend
syn region perlBracesDQ start=+{+ end=+}+ extend contained contains=perlBracesDQ,@perlInterpDQ keepend
syn region perlAnglesDQ start=+<+ end=+>+ extend contained contains=perlAnglesDQ,@perlInterpDQ keepend

" Simple version of searches and matches
syn match perlMatchModifiers "[msixpadluncgo]\+" contained
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\>\s*\z([^[:space:]'([{<#]\)+ end=+\z1+
            \ contains=@perlInterpMatch keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m#+ end=+#+
            \ contains=@perlInterpMatch keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*'+ end=+'+
            \ contains=@perlInterpSQ keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*/+ end=+/+
            \ contains=@perlInterpSlash keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*(+ end=+)+
            \ contains=@perlInterpMatch,perlParensDQ keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*{+ end=+}+
            \ contains=@perlInterpMatch,perlBracesDQ extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*<+ end=+>+
            \ contains=@perlInterpMatch,perlAnglesDQ keepend extend nextgroup=perlMatchModifiers
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!m\s*\[+ end=+\]+
            \ contains=@perlInterpMatch,perlBracketsDQ keepend extend nextgroup=perlMatchModifiers

" Below some hacks to recognise the // variant. This is virtually impossible to catch in all
" cases as the / is used in so many other ways, but these should be the most obvious ones.
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start="\%([$@%&*]\@<!\%(\<split\|\<while\|\<if\|\<unless\|\.\.\|[-+*!~(\[{=]\)\s*\)\@<=/\%(/=\)\@!"
            \ start=+^/\%(/=\)\@!+
            \ start=+\s\@<=/\%(/=\)\@![^[:space:][:digit:]$@%=]\@=\%(/\_s*\%([([{$@%&*[:digit:]"'`]\|\_s\w\|[[:upper:]_abd-fhjklnqrt-wyz]\)\)\@!+
            \ skip=+\~\~/+
            \ end=+/+
            \ contains=@perlInterpSlash extend nextgroup=perlMatchModifiers

" Substitutions
" perlMatch is the first part, perlSubstitution* is the substitution part
syn match perlSubstitutionModifiers "[msixpadluncgero]\+" contained
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\>\s*\z([^[:space:]'([{<#]\)+ end=+\z1+me=e-1
            \ contains=@perlInterpMatch nextgroup=perlSubstitutionGQQ keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*'+ end=+'+me=e-1
            \ contains=@perlInterpSQ nextgroup=perlSubstitutionSQ keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*/+ end=+/+me=e-1
            \ contains=@perlInterpSlash nextgroup=perlSubstitutionGQQ keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s#+ end=+#+me=e-1
            \ contains=@perlInterpMatch nextgroup=perlSubstitutionGQQ keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*(+ end=+)+
            \ contains=@perlInterpMatch,perlParensDQ nextgroup=perlSubstitutionGQQ
            \ skipwhite skipempty skipnl keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*<+ end=+>+
            \ contains=@perlInterpMatch,perlAnglesDQ nextgroup=perlSubstitutionGQQ
            \ skipwhite skipempty skipnl keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*\[+ end=+\]+
            \ contains=@perlInterpMatch,perlBracketsDQ nextgroup=perlSubstitutionGQQ
            \ skipwhite skipempty skipnl keepend extend
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!s\s*{+ end=+}+
            \ contains=@perlInterpMatch,perlBracesDQ nextgroup=perlSubstitutionGQQ
            \ skipwhite skipempty skipnl keepend extend
syn region perlSubstitutionGQQ matchgroup=perlMatchStartEnd
            \ start=+\z([^[:space:]'([{<]\)+ end=+\z1+
            \ keepend contained contains=@perlInterpDQ extend nextgroup=perlSubstitutionModifiers
syn region perlSubstitutionGQQ matchgroup=perlMatchStartEnd
            \ start=+(+ end=+)+
            \ contained contains=@perlInterpDQ,perlParensDQ keepend extend nextgroup=perlSubstitutionModifiers
syn region perlSubstitutionGQQ matchgroup=perlMatchStartEnd
            \ start=+\[+ end=+\]+
            \ contained contains=@perlInterpDQ,perlBracketsDQ keepend extend nextgroup=perlSubstitutionModifiers
syn region perlSubstitutionGQQ matchgroup=perlMatchStartEnd
            \ start=+{+ end=+}+
            \ contained contains=@perlInterpDQ,perlBracesDQ keepend extend extend nextgroup=perlSubstitutionModifiers
syn region perlSubstitutionGQQ matchgroup=perlMatchStartEnd
            \ start=+<+ end=+>+
            \ contained contains=@perlInterpDQ,perlAnglesDQ keepend extend nextgroup=perlSubstitutionModifiers
syn region perlSubstitutionSQ matchgroup=perlMatchStartEnd
            \ start=+'+ end=+'+
            \ contained contains=@perlInterpSQ keepend extend nextgroup=perlSubstitutionModifiers

" Translations
" perlMatch is the first part, perlTranslation* is the second, translator part.
syn match perlTranslationModifiers "[cdsr]\+" contained
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)\>\s*\z([^[:space:]([{<#]\)+ end=+\z1+me=e-1
            \ contains=@perlInterpSQ nextgroup=perlTranslationGQ
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)#+ end=+#+me=e-1
            \ contains=@perlInterpSQ nextgroup=perlTranslationGQ
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)\s*\[+ end=+\]+
            \ contains=@perlInterpSQ,perlBracketsSQ nextgroup=perlTranslationGQ skipwhite skipempty skipnl
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)\s*(+ end=+)+
            \ contains=@perlInterpSQ,perlParensSQ nextgroup=perlTranslationGQ skipwhite skipempty skipnl
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)\s*<+ end=+>+
            \ contains=@perlInterpSQ,perlAnglesSQ nextgroup=perlTranslationGQ skipwhite skipempty skipnl
syn region perlMatch matchgroup=perlMatchStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!\%(tr\|y\)\s*{+ end=+}+
            \ contains=@perlInterpSQ,perlBracesSQ nextgroup=perlTranslationGQ skipwhite skipempty skipnl
syn region perlTranslationGQ matchgroup=perlMatchStartEnd
            \ start=+\z([^[:space:]([{<]\)+ end=+\z1+
            \ contained nextgroup=perlTranslationModifiers
syn region perlTranslationGQ matchgroup=perlMatchStartEnd
            \ start=+(+ end=+)+
            \ contains=perlParensSQ contained nextgroup=perlTranslationModifiers
syn region perlTranslationGQ matchgroup=perlMatchStartEnd
            \ start=+\[+ end=+\]+
            \ contains=perlBracketsSQ contained nextgroup=perlTranslationModifiers
syn region perlTranslationGQ matchgroup=perlMatchStartEnd
            \ start=+{+ end=+}+
            \ contains=perlBracesSQ contained nextgroup=perlTranslationModifiers
syn region perlTranslationGQ matchgroup=perlMatchStartEnd
            \ start=+<+ end=+>+
            \ contains=perlAnglesSQ contained nextgroup=perlTranslationModifiers

" Strings and q, qq, qw and qr expressions
syn region perlStringUnexpanded matchgroup=perlStringStartEnd start="'" end="'" contains=@perlInterpSQ keepend extend
syn region perlString matchgroup=perlStringStartEnd start=+"+ end=+"+ contains=@perlInterpDQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q\>\s*\z([^[:space:]#([{<]\)+ end=+\z1+ contains=@perlInterpSQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q#+ end=+#+ contains=@perlInterpSQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q\s*(+ end=+)+ contains=@perlInterpSQ,perlParensSQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q\s*\[+ end=+\]+ contains=@perlInterpSQ,perlBracketsSQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q\s*{+ end=+}+ contains=@perlInterpSQ,perlBracesSQ keepend extend
syn region perlQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q\s*<+ end=+>+ contains=@perlInterpSQ,perlAnglesSQ keepend extend

syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]\>\s*\z([^[:space:]#([{<]\)+ end=+\z1+
            \ contains=@perlInterpDQ keepend extend
syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]#+ end=+#+ contains=@perlInterpDQ keepend extend
syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]\s*(+ end=+)+ contains=@perlInterpDQ,perlParensDQ keepend extend
syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]\s*\[+ end=+\]+ contains=@perlInterpDQ,perlBracketsDQ keepend extend
syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]\s*{+ end=+}+ contains=@perlInterpDQ,perlBracesDQ keepend extend
syn region perlQQ matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!q[qx]\s*<+ end=+>+ contains=@perlInterpDQ,perlAnglesDQ keepend extend

syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw\s*\z([^[:space:]#([{<]\)+ end=+\z1+ contains=@perlInterpSQ keepend extend
syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw#+ end=+#+ contains=@perlInterpSQ keepend extend
syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw\s*(+ end=+)+ contains=@perlInterpSQ,perlParensSQ keepend extend
syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw\s*\[+ end=+\]+ contains=@perlInterpSQ,perlBracketsSQ keepend extend
syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw\s*{+ end=+}+ contains=@perlInterpSQ,perlBracesSQ keepend extend
syn region perlQW matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qw\s*<+ end=+>+ contains=@perlInterpSQ,perlAnglesSQ keepend extend

syn match perlQRModifiers "[msixpadluno]\+" contained
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\>\s*\z([^[:space:]#([{<'/]\)+ end=+\z1+
            \ contains=@perlInterpMatch keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*/+ end=+/+
            \ contains=@perlInterpSlash keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr#+ end=+#+
            \ contains=@perlInterpMatch keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*'+ end=+'+
            \ contains=@perlInterpSQ keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*(+ end=+)+
            \ contains=@perlInterpMatch,perlParensDQ keepend extend nextgroup=perlQRModifiers

" A special case for qr{}, qr<> and qr[] which allows for comments and extra whitespace in the pattern
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*{+ end=+}+
            \ contains=@perlInterpMatch,perlBracesDQ,perlComment keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*<+ end=+>+
            \ contains=@perlInterpMatch,perlAnglesDQ,perlComment keepend extend nextgroup=perlQRModifiers
syn region perlQR matchgroup=perlStringStartEnd
            \ start=+\<\%(::\|'\|->\)\@<!qr\s*\[+ end=+\]+
            \ contains=@perlInterpMatch,perlBracketsDQ,perlComment keepend extend nextgroup=perlQRModifiers

" Constructs such as <<EOF [...] EOF, i.e., 'here' documents
" XXX: Any statements after the identifier are in perlString colour (i.e.
" 'if $a' in 'print <<EOF if $a'). This is almost impossible to get right it
" seems due to the 'auto-extending nature' of regions.
" XXX: Indented heredocs are not perfect - they sometimes seem to take a moment
"     to update if switched from double to single quotes and vice versa.
" Note: bare delimiters such as << to mean <<"" are not supported. These are a
"       fatal error since 5.28 and, apparently, a rarely used feature.

syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\?\I\i*+ end=+$+ contains=@pgTop oneline
syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\~\I\i*+ end=+$+ contains=@pgTop oneline
syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\?\s*"[^~"]*\%(\~\~.[^~"]*\)*"+ end=+$+ contains=@pgTop oneline
syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\?\s*'[^~']*\%(\~\~.[^~']*\)*'+ end=+$+ contains=@pgTop oneline
syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\?\s*""+ end=+$+ contains=@pgTop oneline
syn region perlHereDocStart matchgroup=perlStringStartEnd
            \ start=+<<\~\?\s*''+ end=+$+ contains=@pgTop oneline

if get(g:, 'pg_perl_fold', 0)
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\z(\I\i*\)+ end=+^\z1$+
                \  contains=perlHereDocStart,@perlInterpDQ fold extend
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\~\z(\I\i*\)+ end=+^\z1$+
                \ contains=perlHereDocStart,@perlInterpSQ fold extend
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*"\z([^~"]*\%(\~\~.[^~"]*\)*\)"+ end=+^\z1$+
                \ contains=perlHereDocStart,@perlInterpDQ fold extend
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*'\z([^~']*\%(\~\~.[^~']*\)*\)'+ end=+^\z1$+
                \ contains=perlHereDocStart,@perlInterpSQ fold extend
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*""+ end=+^$+
                \ contains=perlHereDocStart,@perlInterpDQ,perlNotEmptyLine fold extend
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*''+ end=+^$+
                \ contains=perlHereDocStart,@perlInterpSQ,perlNotEmptyLine fold extend
else
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\z(\I\i*\)+ end=+^\z1$+ contains=perlHereDocStart,@perlInterpDQ
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\~\z(\I\i*\)+ end=+^\z1$+ contains=perlHereDocStart,@perlInterpSQ
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*"\z([^~"]*\%(\~\~.[^~"]*\)*\)"+ end=+^\z1$+ contains=perlHereDocStart,@perlInterpDQ
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*'\z([^~']*\%(\~\~.[^~']*\)*\)'+ end=+^\z1$+ contains=perlHereDocStart,@perlInterpSQ
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*""+ end=+^$+ contains=perlHereDocStart,@perlInterpDQ,perlNotEmptyLine
    syn region perlHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\s*''+ end=+^$+ contains=perlHereDocStart,@perlInterpSQ,perlNotEmptyLine
endif

if get(g:, 'pg_perl_fold', 0)
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\z(\I\i*\)+ end=+^\s*\z1$+ contains=perlIndentedHereDocStart,@perlInterpDQ fold extend
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*"\z([^~"]*\%(\~\~.[^~"]*\)*\)"+ end=+^\s*\z1$+
                \ contains=perlIndentedHereDocStart,@perlInterpDQ fold extend
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*'\z([^~']*\%(\~\~.[^~']*\)*\)'+ end=+^\s*\z1$+
                \ contains=perlIndentedHereDocStart,@perlInterpSQ fold extend
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*""+ end=+^$+
                \ contains=perlIndentedHereDocStart,@perlInterpDQ,perlNotEmptyLine fold extend
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*''+ end=+^$+
                \ contains=perlIndentedHereDocStart,@perlInterpSQ,perlNotEmptyLine fold extend
else
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\z(\I\i*\)+ end=+^\s*\z1$+ contains=perlHereDocStart,@perlInterpDQ
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*"\z([^~"]*\%(\~\~.[^~"]*\)*\)"+ end=+^\s*\z1$+ contains=perlHereDocStart,@perlInterpDQ
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*'\z([^~']*\%(\~\~.[^~']*\)*\)'+ end=+^\s*\z1$+ contains=perlHereDocStart,@perlInterpSQ
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*""+ end=+^$+ contains=perlHereDocStart,@perlInterpDQ,perlNotEmptyLine
    syn region perlIndentedHereDoc matchgroup=perlStringStartEnd
                \ start=+<<\~\s*''+ end=+^$+ contains=perlHereDocStart,@perlInterpSQ,perlNotEmptyLine
endif

" Class declarations
syn match perlPackageDecl "\<package\s\+\%(\h\|::\)\%(\w\|::\)*" contains=perlStatementPackage
syn keyword perlStatementPackage package contained

" Functions
syn match perlSubPrototype "\s*(\([$@%&*\[\];]\|\~\~\)*)" contained extend
syn match perlSubAttribute "\s*:\s*\h\w*\%(([^)]*)\|\)" contained extend
syn match perlSubName "\%(\h\|::\|'\w\)\%(\w\|::\|'\w\)*\s*" contained extend
syn region perlSubDeclaration start="" end="[;{]"
            \ contains=perlSubName,perlSubPrototype,perlSubAttribute,perlSubSignature,perlComment contained transparent
syn match perlFunction "\<sub\>\_s*" nextgroup=perlSubDeclaration

" The => operator forces a bareword to the left of it to be interpreted as
" a string
syn match perlString "\I\@<!-\?\I\i*\%(\s*=>\)\@="

" All other # are comments, except ^#!
syn match perlComment "#.*" contains=perlTodo,@Spell extend
syn match perlSharpBang "^#!.*"

" Formats
syn region perlFormat matchgroup=perlStatementIOFunc
            \ start="^\s*\<format\s\+\k\+\s*=\s*$"rs=s+6 end="^\s*\.\s*$"
            \ contains=perlFormatName,perlFormatField,perlVarPlain,perlVarPlain2
syn match perlFormatName "format\s\+\k\+\s*="lc=7,me=e-1 contained
syn match perlFormatField "[@^][|<>~]\+\%(\.\.\.\)\?" contained
syn match perlFormatField "[@^]#[#.]*" contained
syn match perlFormatField "@\*" contained
syn match perlFormatField "@[^A-Za-z_|<>~#*]"me=e-1 contained
syn match perlFormatField "@$" contained

" Folding
if get(g:, 'pg_perl_fold', 0)
    " Note: this bit must come before the actual highlighting of the `package`
    " keyword, otherwise this will screw up Pod lines that match /^package/
    if !get(g:, 'pg_nofold_packages', 0)
        syn region perlPackageFold
                    \ start="^package \S\+;\s*\%(#.*\)\?$"
                    \ end="^1;\?\s*\%(#.*\)\?$"
                    \ end="\n\+package"me=s-1
                    \ transparent fold keepend
        syn region perlPackageFold start="^\z(\s*\)package\s*\S\+\s*{" end="^\z1}" transparent fold keepend
    endif

    if !get(g:, 'pg_nofold_subs', 0)
        if get(g:, "pg_fold_anonymous_subs", 0)
            " EXPLANATION:
            " \<sub\>                  - `sub` keyword
            " \_[^;{]*                 - any characters, including new line, but not `;` or `{`, zero or more times
            " \%((\([$@%&*\[\];]\|\~\~\)*)\)\?
            "                          - prototype definition, ~~ or $@%&*[]; characters between (), zero or 1 times
            " \_[^;{]*                 - any characters, including new line, but not `;` or `{`, zero or more times
            " {                        - start subroutine block
            syn region perlSubFold
                        \ start="\<sub\>\_[^;{]*\%((\([$@%&*\[\];]\|\~\~\)*)\)\?\_[^;{]*{"
                        \ end="}"
                        \ transparent fold keepend extend
        else
            " EXPLANATION:
            " same, as above, but first non-space character after `sub` keyword must
            " be [A-Za-z_]
            syn region perlSubFold
                        \ start="\<sub\>\s*\h\_[^;{]*\%((\([$@%&*\[\];]\|\~\~\)*)\)\?\_[^;]*{"
                        \ end="}"
                        \ transparent fold keepend extend
        endif

        syn region perlSubFold
                    \ start="\<\%(BEGIN\|END\|CHECK\|INIT\|UNITCHECK\)\>\_s*{"
                    \ end="}"
                    \ transparent fold keepend
    endif

    if get(g:, 'pg_fold_blocks', 0)
        syn region perlBlockFold
                    \ start="^\z(\s*\)\%(if\|elsif\|unless\|for\|while\|until\|given\)\s*(.*)\%(\s*{\)\?\s*\%(#.*\)\?$"
                    \ start="^\z(\s*\)for\%(each\)\?\s*\%(\%(my\|our\)\?\s*\S\+\s*\)\?(.*)\%(\s*{\)\?\s*\%(#.*\)\?$"
                    \ end="^\z1}\s*;\?\%(#.*\)\?$"
                    \ transparent fold keepend

        " TODO this does not work correctly
        syn region perlBlockFold
                    \ start="^\z(\s*\)\%(do\|else\)\%(\s*{\)\?\s*\%(#.*\)\?$"
                    \ end="^\z1}\s*while"
                    \ end="^\z1}\s*;\?\%(#.*\)\?$"
                    \ transparent fold keepend
    else
        if get(g:, 'pg_fold_do_blocks', 0)
            syn region perlDoBlockDeclaration start="" end="{" contains=perlComment contained transparent
            syn match perlOperator "\<do\>\_s*" nextgroup=perlDoBlockDeclaration

            syn region perlDoBlockFold start="\<do\>\_[^{]*{" end="}" transparent fold keepend extend
        endif
    endif
endif

" The default highlighting.
hi def link perlSharpBang             PreProc
hi def link perlControl               PreProc
hi def link perlInclude               Include
hi def link perlSpecial               Special
hi def link perlString                String
hi def link perlCharacter             Character
hi def link perlNumber                Number
hi def link perlFloat                 Float
hi def link perlType                  Type
hi def link perlIdentifier            Identifier
hi def link perlLabel                 Label
hi def link perlStatement             Statement
hi def link perlConditional           Conditional
hi def link perlRepeat                Repeat
hi def link perlOperator              Operator
hi def link perlFunction              Keyword
hi def link perlSubName               Function
hi def link perlSubPrototype          Type
hi def link perlSubSignature          Type
hi def link perlSubAttribute          PreProc
hi def link perlComment               Comment
hi def link perlTodo                  Todo
hi def link perlStringStartEnd        perlString
hi def link perlVStringV              perlStringStartEnd
hi def link perlList                  perlStatement
hi def link perlMisc                  perlStatement
hi def link perlVarPlain              perlIdentifier
hi def link perlVarPlain2             perlIdentifier
hi def link perlArrow                 perlIdentifier
hi def link perlFiledescStatement     perlIdentifier
hi def link perlVarSimpleMember       perlIdentifier
hi def link perlVarSimpleMemberName   perlString
hi def link perlVarNotInMatches       perlIdentifier
hi def link perlVarSlash              perlIdentifier
hi def link perlQ                     perlString
hi def link perlQQ                    perlString
hi def link perlQW                    perlString
hi def link perlQR                    perlString
hi def link perlMatchModifiers        perlMatchStartEnd
hi def link perlSubstitutionModifiers perlMatchStartEnd
hi def link perlTranslationModifiers  perlMatchStartEnd
hi def link perlQRModifiers           perlStringStartEnd
hi def link perlHereDoc               perlString
hi def link perlIndentedHereDoc       perlString
hi def link perlStringUnexpanded      perlString
hi def link perlSubstitutionSQ        perlString
hi def link perlSubstitutionGQQ       perlString
hi def link perlTranslationGQ         perlString
hi def link perlMatch                 perlString
hi def link perlMatchStartEnd         perlStatement
hi def link perlFormatName            perlIdentifier
hi def link perlFormatField           perlString
hi def link perlPackageDecl           perlType
hi def link perlStorageClass          perlType
hi def link perlPackageRef            perlType
hi def link perlStatementPackage      perlStatement
hi def link perlStatementStorage      perlStatement
hi def link perlStatementControl      perlStatement
hi def link perlStatementScalar       perlStatement
hi def link perlStatementRegexp       perlStatement
hi def link perlStatementNumeric      perlStatement
hi def link perlStatementList         perlStatement
hi def link perlStatementHash         perlStatement
hi def link perlStatementVector       perlStatement
hi def link perlStatementFlow         perlStatement
hi def link perlStatementProc         perlStatement
hi def link perlStatementTime         perlStatement
hi def link perlStatementMisc         perlStatement
hi def link perlStatementIndirObj     perlStatement
hi def link perlFunctionName          perlIdentifier
hi def link perlMethod                perlIdentifier
hi def link perlPostDeref             perlIdentifier
hi def link perlFunctionPRef          perlType

if !get(g:, 'pg_include_pod', 0)
    hi def link perlPOD perlComment
endif
hi def link perlSpecialAscii   perlSpecial
hi def link perlSpecialDollar  perlSpecial
hi def link perlSpecialString  PreProc
hi def link perlSpecialMatch   perlSpecial

" NOTE: Due to a bug in Vim (or more likely, a misunderstanding on my part),
"    I had to remove the transparent property from the following regions
"    in order to get them to highlight correctly.  Feel free to remove
"    these and reinstate the transparent property if you know how.
hi def link perlParensSQ   perlString
hi def link perlBracketsSQ perlString
hi def link perlBracesSQ   perlString
hi def link perlAnglesSQ   perlString

hi def link perlParensDQ   perlString
hi def link perlBracketsDQ perlString
hi def link perlBracesDQ   perlString
hi def link perlAnglesDQ   perlString

hi def link perlSpecialStringU2 perlString

" Possible errors
hi def link perlNotEmptyLine Error
hi def link perlElseIfError  Error

if exists('g:pg_minlines')
    execute "syn sync minlines=" . g:pg_minlines
else
    syn sync fromstart
endif

hi def bold term=bold cterm=bold gui=bold
hi def italic term=italic cterm=italic gui=italic
hi def boldItalic term=bold,italic cterm=bold,italic gui=bold,italic
hi def trailingWhitespace ctermbg=176 guibg=#d787d7

" PG specific

syn region pgAfterEndDocument
            \ start=/\(^\s*ENDDOCUMENT\(()\)\@!\)\@<=.\{-}$/
            \ start=/\(^\s*ENDDOCUMENT();\@!\)\@<=.\{-}$/
            \ start=/\(^\s*ENDDOCUMENT();\)\@<=.\{-}$/
            \ end="\%$"
            \ fold contains=NONE

hi def link pgAfterEndDocument Comment

" PGML
syn region pgmlPerlCommand matchgroup=PreProc start=/\[@/ end=/@\]\*\{0,3}/ contained contains=@pgTop
syn region pgmlPerlVariable matchgroup=PreProc start=/\[\$\@=/ end=/\]\*\{0,3}/ contained contains=@pgTop
syn region pgmlOption matchgroup=PreProc nextgroup=pgmlOption start=/{/ end=/}/ contained contains=@pgTop
syn match pgmlAnswer /\[\(_\+\|[ox^]\)\]\*\?/ nextgroup=pgmlOption contained
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
syn match pgmlAlignment /^>>/ contained
syn match pgmlCenter /<<\( \{2,3}\)\?$/ contained
syn match pgmlPreformatted /^\(\( \{4}\)\|\t\)*: \{3}/ contained
syn region pgmlCode matchgroup=PreProc start=/^```/ end=/```/ nextgroup=pgmlCodeClass contained
            \ contains=pgmlCodeClass,Character
syn match pgmlCodeClass /\(^```\)\@<=[a-z0-9]\+$/
syn match pgmlTrailingWhitespace /[ \t]\+$/ contained
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

hi def link pgmlAnswer              Character
hi def link pgmlComment             Comment
hi def link pgmlMathMode            Character
hi def link pgmlParsed              Character
hi def link pgmlBold                bold
hi def link pgmlItalic              italic
hi def link pgmlBoldItalic          boldItalic
hi def link pgmlEscape              PreProc
hi def link pgmlRule                PreProc
hi def link pgmlTrailingWhitespace  trailingWhitespace
hi def link pgmlHeader1             Title
hi def link pgmlHeader2             Title
hi def link pgmlHeader3             Title
hi def link pgmlHeader4             Title
hi def link pgmlHeader5             Title
hi def link pgmlHeader6             Title
hi def link pgmlAlignment           PreProc
hi def link pgmlCenter              PreProc
hi def link pgmlPreformatted        PreProc
hi def link pgmlCodeClass           PreProc
hi def link pgmlUnorderedListMarker Statement
hi def link pgmlOrderedListMarker   Statement

" PG Text
syn region pgTextPerlCommand matchgroup=PreProc start=/\\{/ end=/\\}/ contained contains=@pgTop
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

hi def link pgTextMathMode          Character
hi def link pgTextParsedMath        Character
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

let &cpo = s:cpo_save
unlet s:cpo_save

" vim:ts=4:sts=4:sw=4:expandtab:ft=vim
