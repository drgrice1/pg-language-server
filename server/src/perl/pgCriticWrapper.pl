#!/usr/bin/env perl

use Mojo::Base -strict;

use Getopt::Long       qw(GetOptions);
use File::Spec         ();
use File::Basename     ();
use Unicode::Normalize qw(NFKD);
use PPI                ();
use Perl::Critic       ();

my ($file, $profile, $severity, $theme, $exclude, $include);
GetOptions(
    "file=s"     => \$file,
    "profile=s"  => \$profile,
    "severity=s" => \$severity,
    "theme=s"    => \$theme,
    "exclude=s"  => \$exclude,
    "include=s"  => \$include,
);

my $source = do { local $/; <> };
die "The source must be passed via stdin" if !defined $source;

$profile = resolve_profile($profile);

say "Running perlcritic on $file and using profile $profile";

$source = preprocess_code($source);
$source =~ s/([^\x00-\x7F])/AsciiReplacementChar($1)/ge;

my $doc = PPI::Document->new(\$source);

# Do not check for readability of the source $file since it is not actually read.
# The file name needs to be set for policy violations that rely on it.
$doc->{filename} = $file;

my $critic = Perl::Critic->new(
    -profile  => $profile,
    -severity => $severity,
    -theme    => $theme,
    -exclude  => $exclude ? [$exclude] : [],
    -include  => $include ? [$include] : []
);
Perl::Critic::Violation::set_format("%s~|~%l~|~%c~|~%m~|~%p~||~");

my @violations = $critic->critique($doc);

if (@violations) {
    say "Perl Critic violations:";
    for my $violation (@violations) {
        say $violation->to_string;
    }
}

# FIXME: This probably needs to be done differently than the PG translator to preserve spacing.
sub preprocess_code {
    my ($evalString) = @_;

    $evalString =~ s/\r\n/\n/g;

    $evalString =~ s/\n\h*END_TEXT[\h;]*\n/\nEND_TEXT\n/g;
    $evalString =~ s/\n\h*END_PGML[\h;]*\n/\nEND_PGML\n/g;
    $evalString =~ s/\n\h*END_PGML_SOLUTION[\h;]*\n/\nEND_PGML_SOLUTION\n/g;
    $evalString =~ s/\n\h*END_PGML_HINT[\h;]*\n/\nEND_PGML_HINT\n/g;
    $evalString =~ s/\n\h*END_SOLUTION[\h;]*\n/\nEND_SOLUTION\n/g;
    $evalString =~ s/\n\h*END_HINT[\h;]*\n/\nEND_HINT\n/g;
    $evalString =~ s/\n\h*BEGIN_TEXT[\h;]*\n/\nSTATEMENT\(EV3P\(<<'END_TEXT'\)\);\n/g;
    $evalString =~ s/\n\h*BEGIN_PGML[\h;]*\n/\nSTATEMENT\(PGML::Format2\(<<'END_PGML'\)\);\n/g;
    $evalString =~ s/\n\h*BEGIN_PGML_SOLUTION[\h;]*\n/\nSOLUTION\(PGML::Format2\(<<'END_PGML_SOLUTION'\)\);\n/g;
    $evalString =~ s/\n\h*BEGIN_PGML_HINT[\h;]*\n/\nHINT\(PGML::Format2\(<<'END_PGML_HINT'\)\);\n/g;
    $evalString =~ s/\n\h*BEGIN_SOLUTION[\h;]*\n/\nSOLUTION\(EV3P\(<<'END_SOLUTION'\)\);\n/g;
    $evalString =~ s/\n\h*BEGIN_HINT[\h;]*\n/\nHINT\(EV3P\(<<'END_HINT'\)\);\n/g;
    $evalString =~ s/\n\h*(.*)\h*->\h*BEGIN_TIKZ[\h;]*\n/\n$1->tex\(<<END_TIKZ\);\n/g;
    $evalString =~ s/\n\h*END_TIKZ[\h;]*\n/\nEND_TIKZ\n/g;
    $evalString =~ s/\n\h*(.*)\h*->\h*BEGIN_LATEX_IMAGE[\h;]*\n/\n$1->tex\(<<END_LATEX_IMAGE\);\n/g;
    $evalString =~ s/\n\h*END_LATEX_IMAGE[\h;]*\n/\nEND_LATEX_IMAGE\n/g;

    $evalString =~ s/ENDDOCUMENT.*/ENDDOCUMENT();/s;

    $evalString =~ s/\\/\\\\/g;
    $evalString =~ s/~~/\\/g;

    return $evalString;
}

# Tries to find ascii replacements for non-ascii characters.
# Usually a horrible solution, but Perl::Critic otherwise crashes on unicode data
sub AsciiReplacementChar {
    my ($sChar) = @_;
    my $sSanitized = NFKD($sChar);
    $sSanitized =~ s/[^a-zA-Z]//g;
    if (length($sSanitized) >= 1) {
        # This path is decent. Basically strips accents and character modifiers.
        # Might turn 1 character into multiple (ligatures, roman numerals)
        return $sSanitized;
    }
    # Far worse, but we still need a character. Map to a deterministic choice in A-Za-z.
    # Totally butchers the word, but allows critic to still find unused subs, duplicate hash keys, etc.
    my $ord = ord($sChar) % 52;
    return $ord < 26 ? chr($ord + 65) : chr($ord + 71);
}

sub resolve_profile {
    my $profile = shift;
    if ($profile) {
        return $profile if -f $profile;
        die "User specified Critic profile $profile not readable";
    }

    return $ENV{'PERLCRITIC'} if $ENV{'PERLCRITIC'} && -r $ENV{'PERLCRITIC'};

    if (my $home_dir = find_home_dir()) {
        $profile = File::Spec->catfile($home_dir, '.pg-perlcriticrc');
        return $profile if -f $profile;
    }

    $profile = File::Spec->catfile(File::Basename::dirname(__FILE__), 'defaultCriticProfile');
    die "Can't find the pg language server's default profile $profile ?!" unless -f $profile;

    return $profile;
}

sub find_home_dir {
    # This logic is taken from File::HomeDir::Tiny (via Perl::Critic)
    return $^O eq 'MSWin32' && "$]" < 5.016 ? ($ENV{HOME} || $ENV{USERPROFILE}) : (<~>)[0];
}
