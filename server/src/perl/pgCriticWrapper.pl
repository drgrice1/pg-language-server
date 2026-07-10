#!/usr/bin/env perl

use Mojo::Base -strict;

use File::Spec     ();
use File::Basename ();

use lib File::Spec->catfile(File::Basename::dirname(__FILE__), 'pg/lib');

use Getopt::Long qw(GetOptions);
use PPI          ();
use Perl::Critic ();

require WeBWorK::PG::Translator;

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

my $translatedSource = WeBWorK::PG::Translator::default_preprocess_code($source);

my $document = PPI::Document->new(\$translatedSource);

# Provide the untranslated code so that policies can access it. It will be in the _doc key of the $document that is
# passed as the third argument to the violates method. See Perl::Critic::Policy::PG::ProhibitEnddocumentMatter which
# uses this for example.
$document->{untranslatedCode} = $source;

# Do not check for readability of the source $file since it is not actually read.
# The file name needs to be set for policy violations that rely on it.
$document->{filename} = $file;

my $critic = Perl::Critic->new(
    -profile  => $profile,
    -severity => $severity,
    -theme    => $theme,
    -exclude  => $exclude ? [$exclude] : [],
    -include  => $include ? [$include] : []
);
Perl::Critic::Violation::set_format("%s~|~%l~|~%c~|~%m~|~%p~||~");

my @violations = $critic->critique($document);

if (@violations) {
    say "Perl Critic violations:";
    for my $violation (@violations) {
        say $violation->to_string;
    }
}

sub resolve_profile {
    my $profile = shift;
    if ($profile) {
        return $profile if -f $profile;
        die "User specified Critic profile $profile not readable";
    }

    return $ENV{PERLCRITIC} if $ENV{PERLCRITIC} && -r $ENV{PERLCRITIC};

    $profile = File::Spec->catfile(File::Basename::dirname(__FILE__), 'defaultCriticProfile');
    die "Can't find the pg language server's default profile $profile." unless -f $profile;

    return $profile;
}
