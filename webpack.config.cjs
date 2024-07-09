/* eslint-env node */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

module.exports = [
    // coc client configuration
    {
        context: __dirname,
        target: 'node',
        entry: { extension: './coc-client/src/extension.ts' },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'coc-client', 'dist'),
            library: { type: 'commonjs' }
        },
        resolve: {
            modules: ['node_modules'],
            extensions: ['.ts', '.js'],
            mainFields: ['module', 'main'],
            mainFiles: ['extension']
        },
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: [{ loader: 'ts-loader' }] }] },
        externals: { 'coc.nvim': 'commonjs coc.nvim' },
        devtool: 'source-map'
    },
    // vscode client configuration
    {
        context: __dirname,
        target: 'node',
        entry: { extension: './vscode-client/src/extension.ts' },
        output: {
            filename: '[name].js',
            path: path.join(__dirname, 'vscode-client', 'dist'),
            library: { type: 'commonjs' }
        },
        resolve: {
            mainFields: ['module', 'main'],
            extensions: ['.ts', '.js'],
            fallback: {
                path: false,
                process: false,
                os: false,
                fs: false,
                child_process: false,
                util: false
            }
        },
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: [{ loader: 'ts-loader' }] }] },
        externals: { vscode: 'commonjs vscode' },
        performance: { hints: false },
        devtool: 'source-map'
    },
    // language server configuration
    {
        context: __dirname,
        target: 'node',
        entry: { server: './server/src/server.ts' },
        output: {
            filename: '[name].js',
            path: path.resolve(__dirname, 'dist'),
            library: { name: 'serverExportVar', type: 'var' }
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
        module: { rules: [{ test: /\.ts$/, exclude: /node_modules/, use: [{ loader: 'ts-loader' }] }] },
        externals: { vscode: 'commonjs vscode' },
        performance: { hints: false },
        devtool: 'source-map'
    }
];
