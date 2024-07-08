/* eslint-env node */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

module.exports = [
    // coc-client configuration
    {
        context: __dirname,
        target: 'node',
        entry: {
            extension: './coc-client/src/extension.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist'),
            library: { type: 'commonjs' }
        },
        resolve: {
            modules: ['node_modules'],
            extensions: ['.js', '.ts'],
            mainFields: ['browser', 'module', 'main'],
            mainFiles: ['extension']
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
            'coc.nvim': 'commonjs coc.nvim'
        },
        devtool: 'source-map'
    },
    // language server configuration
    {
        context: __dirname,
        target: 'node',
        entry: {
            server: './server/src/server.ts'
        },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist'),
            libraryTarget: 'var',
            library: 'serverExportVar'
        },
        resolve: {
            mainFields: ['module', 'main'],
            extensions: ['.ts', '.js'],
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
            vscode: 'commonjs vscode'
        },
        performance: {
            hints: false
        },
        devtool: 'source-map'
    }
];
