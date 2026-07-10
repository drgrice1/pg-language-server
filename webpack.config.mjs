import path from 'path';

export default [
    // coc client configuration
    {
        context: import.meta.dirname,
        target: 'node',
        entry: { extension: './coc-client/src/extension.ts' },
        output: {
            filename: '[name].js',
            path: path.resolve(import.meta.dirname, 'coc-client', 'dist'),
            library: { type: 'commonjs' }
        },
        resolve: {
            modules: ['node_modules'],
            extensions: ['.ts', '.js'],
            mainFields: ['module', 'main'],
            mainFiles: ['extension']
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                projectReferences: false,
                                compilerOptions: { composite: false, declaration: false, declarationMap: false }
                            }
                        }
                    ]
                }
            ]
        },
        externals: { 'coc.nvim': 'commonjs coc.nvim' },
        devtool: 'source-map'
    },
    // vscode client configuration
    {
        context: import.meta.dirname,
        target: 'node',
        entry: { extension: './vscode-client/src/extension.ts' },
        output: {
            filename: '[name].js',
            path: path.join(import.meta.dirname, 'vscode-client', 'dist'),
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
        module: {
            noParse: /vscode-languageserver-types/,
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                projectReferences: false,
                                compilerOptions: { composite: false, declaration: false, declarationMap: false }
                            }
                        }
                    ]
                }
            ]
        },
        externals: {
            vscode: 'commonjs vscode',
            'vscode-languageclient': 'commonjs vscode-languageclient',
            'vscode-languageclient/node': 'commonjs vscode-languageclient/node'
        },
        performance: { hints: false },
        devtool: 'source-map'
    },
    // language server configuration
    {
        context: import.meta.dirname,
        target: 'node',
        entry: { server: './server/src/server.ts' },
        output: {
            filename: '[name].js',
            path: path.resolve(import.meta.dirname, 'dist'),
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
        module: {
            noParse: /vscode-languageserver-types/,
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        {
                            loader: 'ts-loader',
                            options: {
                                projectReferences: false,
                                compilerOptions: { composite: false, declaration: false, declarationMap: false }
                            }
                        }
                    ]
                }
            ]
        },
        externals: {
            vscode: 'commonjs vscode',
            'vscode-languageserver': 'commonjs vscode-languageserver',
            'vscode-languageserver/node': 'commonjs vscode-languageserver/node',
            'vscode-languageserver-protocol': 'commonjs vscode-languageserver-protocol'
        },
        performance: { hints: false },
        devtool: 'source-map'
    }
];
