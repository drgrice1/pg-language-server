import "process";
import { tmpdir } from "os";
import { rmSync, mkdirSync, mkdtempSync, createReadStream, createWriteStream } from "fs";
import { dirname, join } from "path";

let haveExtractedAssets = false;
let pkgAssetPath: string;

async function extractAssetsIfNecessary(): Promise<string> {
    if (!haveExtractedAssets) {
        pkgAssetPath = mkdtempSync(join(tmpdir(), "perl-navigator"));
        let assets: string[] = [
            "src/perl/lib_bs22/ModHunter.pl",
            "src/perl/Inquisitor.pm",
            "src/perl/criticWrapper.pl",
            "src/perl/lib_bs22/Class/Inspector.pm",
            "src/perl/lib_bs22/Devel/Symdump.pm",
            "src/perl/lib_bs22/Devel/Symdump/Export.pm",
            "src/perl/lib_bs22/Inspectorito.pm",
            "src/perl/lib_bs22/SubUtilPP.pm",
            "src/perl/lib_bs22/SourceStash.pm",
            "src/perl/lib_bs22/pltags.pm",
            "src/perl/defaultCriticProfile",
            "src/perl/tidyWrapper.pl",
            "src/perl/perlimportsWrapper.pl",
        ];

        assets.forEach((asset) => {
            let source = join(dirname(__dirname), asset);
            let dest = join(pkgAssetPath, asset);
            mkdirSync(dirname(dest), { recursive: true }); // Create all parent folders
            createReadStream(source).pipe(createWriteStream(dest));
        });

        haveExtractedAssets = true;
        // Allow time to copy. TODO: Change writeStreams to be async and just wait on them
        return new Promise(resolve => setTimeout(() => resolve(pkgAssetPath), 50));
    }
    return pkgAssetPath;
}

async function getAssetsPath(): Promise<string> {
    let anyProcess = <any>process;
    if (anyProcess.pkg) {
        // When running inside of a pkg built executable, the assets
        // are available via the snapshot filesystem.  That file
        // system is only available through the node API, so the
        // assets need to be extracted in order to be accessible by
        // the perl command
        return extractAssetsIfNecessary();
    }

    return dirname(__dirname);
}

export async function getPerlAssetsPath(): Promise<string> {
    return join(await getAssetsPath(), "src", "perl");
}

export function cleanupTemporaryAssetPath() {
    if (haveExtractedAssets) {
        rmSync(pkgAssetPath, { recursive: true }); // Create all parent folders
        haveExtractedAssets = false;
    }
}
