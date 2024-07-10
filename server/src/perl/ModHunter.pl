#!/usr/bin/env perl

use strict;
use warnings;
use feature 'say';

use File::Find ();
use Mojo::File qw(curfile);

# Generally, having keywords like "if" provide hover or definitions as a module is more confusing than helpful.
# So these are skipped.
my %skipModules = (if => 1, open => 1, sort => 1, next => 1);

sub get_modules {
    # Add the pg library directory first in the search order.
    my @dirs = (curfile->dirname . '/pg/lib');

    # Clean up @INC
    for my $dirname (@INC) {
        if (-d $dirname) {
            next if $dirname eq '.';
            $dirname =~ s{/+}{/}g;
            $dirname =~ s{/$}{};
            push @dirs, $dirname;
        }
    }
    @dirs = uniq(@dirs);

    my @files;
    File::Find::find(
        {
            wanted => sub {
                # Skip hidden dirs
                if ($File::Find::dir =~ /\/\./) { $File::Find::prune = 1; return }
                push @files, $_ if -f $_ && /\.pm$/;
            },
            no_chdir    => 1,
            follow_fast => 1,
            follow_skip => 2
        },
        reduce_dirs(@dirs)
    );
    @files = uniq(@files);

    my @mods;
    my %seen;
    for my $file (@files) {
        my @ds;
        for my $dir (@dirs) {
            push @ds, $dir if index($file, $dir) == 0;
        }
        my $d      = (sort { length($b) <=> length($a) } @ds)[0];
        my $module = (substr($file, (length($d) + 1)) =~ s/\.pm$//r) =~ s{/}{::}gr;
        # Only keep the first module found in @INC, since that's the perl resolution order.
        push(@mods, [ $module, $file ]) unless $skipModules{$module} || $seen{$module};
        $seen{$module} = 1;
    }

    return \@mods;
}

# Reduce a list of directory names by eliminating names which contain other names.  For example, if the input array
# contains (/a/b/c/d /a/b/c /a/b), return an array containing (/a/b).
sub reduce_dirs {
    my @dirs            = @_;
    my %substring_count = map { $_ => 0 } @dirs;

    for my $x (@dirs) {
        for my $y (@dirs) {
            next if $x eq $y;
            if (index($x, $y) == 0) {
                # if y is substring of x, starting at position 0
                ++$substring_count{$x};
            }
        }
    }

    my @dsubs = grep { $substring_count{$_} == 0 } @dirs;

    return @dsubs;
}

sub uniq {
    my @list = @_;
    my %seen;
    my $k;
    return grep { defined $_ ? !$seen{ $k = $_ }++ : 0 } @list;
}

for my $module (@{ get_modules() }) {
    say "\tM\t$module->[0]\t$module->[1]\t";
}

1;

=head1 NAME

ModHunter.pl

=head1 SYNOPSIS

The mod hunter finds the list of importable modules.

This script is mostly copied from PerlMonks:
L<https://www.perlmonks.org/?node_id=795418>

=cut
