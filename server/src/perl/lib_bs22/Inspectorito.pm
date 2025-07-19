package Inspectorito;
use parent qw(Class::Inspector);

# The Inspectorito, or "Little Inspector" is a subclass of Class::Inspector built for the perl navigator It overrides
# ->methods to only specify locally defined methods. Normally, all imported functions become methods on a class which
# pollutes the namespace.  For example, if an object $foo uses the Data::Dumper internally, you can $foo->Dumper() on
# that object despite it not making any sense.

use strict qw{vars subs};
use warnings;
use vars qw{$VERSION $RE_IDENTIFIER $RE_CLASS $UNIX $BIDENTIFY};

use File::Spec ();

BEGIN {
    $VERSION = '1.28';

SCOPE: {
        local $@;
        eval "require utf8; utf8->import";    ## no critic (BuiltinFunctions::ProhibitStringyEval)
    }

    # Predefine some regexs
    $RE_IDENTIFIER = qr/\A[^\W\d]\w*\z/s;
    $RE_CLASS      = qr/\A[^\W\d]\w*(?:(?:\'|::)\w+)*\z/s;

    # Are we on something Unix-like?
    $UNIX = !!($File::Spec::ISA[0] eq 'File::Spec::Unix');

    require Sub::Util;
}

sub local_methods {
    my ($class, $package, @arguments) = @_;
    my $name = $class->_class($package) or return;
    @arguments = map { lc $_ } @arguments;

    # Only works if the class is loaded
    return unless $class->loaded($name);

    # Get the super path ( not including UNIVERSAL )
    # Rather than using Class::ISA, we'll use an inlined version
    # that implements the same basic algorithm.
    my @path  = ();
    my @queue = ($name);
    my %seen  = ($name => 1);
    while (my $cl = shift @queue) {
        push @path, $cl;
        unshift @queue, grep { !$seen{$_}++ }
            map { my $isa = $_; $isa =~ s/^::/main::/; $isa =~ s/\'/::/g; $isa } (@{"${cl}::ISA"});
    }

    # Find and merge the function names across the entire super path.
    # Sort alphabetically and return.
    my %methods = ();
    for my $namespace (@path) {
        my @functions = grep { !$methods{$_} }
            grep {/$RE_IDENTIFIER/o}
            grep { defined &{"${namespace}::$_"} }
            keys %{"${namespace}::"};

        for my $func (@functions) {
            if (my $codeRef = UNIVERSAL::can($namespace, $func)) {
                my $source = Sub::Util::subname($codeRef);
                my $pack;
                $pack = $1 if $source =~ m/^(.+)::.*?$/;
                next unless defined $pack && $namespace eq $pack;
            } else {
                # What are these things?
                next;
            }
            $methods{$func} = $namespace;
        }
    }

    # Filter to public or private methods if needed
    my @methodlist = sort keys %methods;

    return \@methodlist;
}

1;

