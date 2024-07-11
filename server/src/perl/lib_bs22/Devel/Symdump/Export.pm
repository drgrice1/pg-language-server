## no critic
## use critic
package Devel::Symdump::Export;
use parent qw(Exporter);

use strict;
## no critic (TestingAndDebugging::RequireUseWarnings)
use vars qw(@ISA @EXPORT_OK $AUTOLOAD);

require Devel::Symdump;
use Carp qw( confess );

@EXPORT_OK = ('packages', 'scalars', 'arrays', 'hashes', 'functions', 'filehandles', 'dirhandles', 'ios', 'unknowns');
my %OK;
@OK{@EXPORT_OK} = (1) x @EXPORT_OK;

push @EXPORT_OK, "symdump";

# undocumented feature symdump() -- does it save enough typing?
sub symdump {
    my @packages = @_;
    return Devel::Symdump->new(@packages)->as_string;
}

AUTOLOAD {
    my @packages = @_;
    (my $auto = $AUTOLOAD) =~ s/.*:://;
    confess("Unknown function call $auto") unless $OK{$auto};
    my @ret = Devel::Symdump->new->$auto(@packages);
    return @ret;
}

1;

