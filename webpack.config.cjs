/* eslint-env node */

//@ts-check
'use strict';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

module.exports = [
    /** @type WebpackConfig */
    {
        context: __dirname,
        target: 'node', // web extensions run in a webworker context
        entry: {
            server: './src/server.ts'
        },
        output: {
            filename: '[name].js',
            path: path.join(__dirname, 'dist'),
            libraryTarget: 'var',
            library: 'serverExportVar'
        },
        resolve: {
            mainFields: ['module', 'main'],
            extensions: ['.ts', '.js'], // support ts-files and js-files
            alias: {},
            fallback: {
                path: false,
                process: false,
                os: false,
                fs: false,
                child_process: false,
                util: false
            }
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader'
                        }
                    ]
                }
            ]
        },
        externals: {
            vscode: 'commonjs vscode' // ignored because it doesn't exist
        },
        performance: {
            hints: false
        },
        devtool: 'source-map'
    }
];
