import 'process';
import { tmpdir } from 'os';
import { rmSync, mkdirSync, mkdtempSync, createReadStream, createWriteStream } from 'fs';
import { dirname, join } from 'path';

let haveExtractedAssets = false;
let pkgAssetPath: string;

const extractAssetsIfNecessary = async (): Promise<string> => {
    if (!haveExtractedAssets) {
        pkgAssetPath = mkdtempSync(join(tmpdir(), 'pg-language-server'));
        const assets: string[] = [
            'server/src/perl/ModHunter.pl',
            'server/src/perl/Inquisitor.pm',
            'server/src/perl/pgCriticWrapper.pl',
            'server/src/perl/lib_bs22/Inspectorito.pm',
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
};

const getAssetsPath = async (): Promise<string> => {
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
};

export const getPerlAssetsPath = async (): Promise<string> => join(await getAssetsPath(), 'server', 'src', 'perl');

export const cleanupTemporaryAssetPath = (): void => {
    if (haveExtractedAssets) {
        rmSync(pkgAssetPath, { recursive: true }); // Create all parent folders
        haveExtractedAssets = false;
    }
};
