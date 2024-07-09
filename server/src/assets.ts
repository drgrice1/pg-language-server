import 'process';
import { tmpdir } from 'os';
import { rmSync, mkdirSync, mkdtempSync, createReadStream, createWriteStream } from 'fs';
import { dirname, join } from 'path';

let haveExtractedAssets = false;
let pkgAssetPath: string;

async function extractAssetsIfNecessary(): Promise<string> {
    if (!haveExtractedAssets) {
        pkgAssetPath = mkdtempSync(join(tmpdir(), 'pg-language-server'));
        const assets: string[] = [
            'server/src/perl/lib_bs22/ModHunter.pl',
            'server/src/perl/Inquisitor.pm',
            'server/src/perl/pgCriticWrapper.pl',
            'server/src/perl/lib_bs22/Class/Inspector.pm',
            'server/src/perl/lib_bs22/Devel/Symdump.pm',
            'server/src/perl/lib_bs22/Devel/Symdump/Export.pm',
            'server/src/perl/lib_bs22/Inspectorito.pm',
            'server/src/perl/lib_bs22/SubUtilPP.pm',
            'server/src/perl/lib_bs22/SourceStash.pm',
            'server/src/perl/lib_bs22/pltags.pm',
            'server/src/perl/defaultCriticProfile',
            'server/src/perl/pgTidyWrapper.pl'
        ];

        assets.forEach((asset) => {
            const source = join(dirname(__dirname), asset);
            const dest = join(pkgAssetPath, asset);
            mkdirSync(dirname(dest), { recursive: true }); // Create all parent folders
            createReadStream(source).pipe(createWriteStream(dest));
        });

        haveExtractedAssets = true;
        // Allow time to copy. TODO: Change writeStreams to be async and just wait on them
        return new Promise((resolve) => setTimeout(() => resolve(pkgAssetPath), 50));
    }
    return pkgAssetPath;
}

async function getAssetsPath(): Promise<string> {
    const anyProcess = process;
    // @ts-expect-error Typescript does not recognize pkg as a property of a NodeJS.Process.
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
    return join(await getAssetsPath(), 'server', 'src', 'perl');
}

export function cleanupTemporaryAssetPath() {
    if (haveExtractedAssets) {
        rmSync(pkgAssetPath, { recursive: true }); // Create all parent folders
        haveExtractedAssets = false;
    }
}
