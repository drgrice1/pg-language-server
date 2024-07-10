#!/usr/bin/env perl

use strict;
use warnings;
use utf8;

use Getopt::Long qw(GetOptions);
use Mojo::File   qw(curfile);

use lib curfile->dirname . '/pg/lib';
use WeBWorK::PG::Tidy qw(pgtidy);

my ($file, $profile);
GetOptions("profile=s" => \$profile);

my $source = do { local $/; <STDIN> };    ## no critic (InputOutput::ProhibitExplicitStdin)
die "Did not pass any source via stdin" if !defined $source;
die "PerlTidy profile not readable"     if $profile && !-f $profile;    # Profie may be undef

my ($destination, $stderr, $formatErrors);

local @ARGV = '-nst';
push(@ARGV, "-pro=$profile") if $profile;

my $error_flag = pgtidy(
    source      => \$source,
    destination => \$destination,
    stderr      => \$stderr,
    errorfile   => \$formatErrors    # Important to make sure the user's workspace is not polluted with .ERR files
);

my $uuid = '87ec3595-4186-45df-b647-13c11e67b138';

# Will remove the UUID and any data beforehand in case we get any extra output anywhere. We really don't want to inject
# garbage (or logs) into people's source code.
print "$uuid$destination$uuid";

1;
