const js = require("@eslint/js");

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
    js.configs.recommended,
    {
        ignores: [
            "**/node_modules/**",
            "**/dist/**",
            "**/*.min.js",
            "**/package-lock.json"
        ]
    },
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                PIXI: "readonly",
                window: "readonly",
                document: "readonly",
                console: "readonly",
                performance: "readonly",
                requestAnimationFrame: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                setTimeout: "readonly",
                URL: "readonly",
                fetch: "readonly",
                Audio: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                module: "readonly",
                require: "readonly",
                exports: "readonly",
                global: "readonly"
            }
        },
        rules: {
            indent: [
                "error",
                4,
                {
                    SwitchCase: 1,
                    VariableDeclarator: 1,
                    outerIIFEBody: 1,
                    MemberExpression: 1,
                    FunctionDeclaration: { body: 1, parameters: 2 },
                    FunctionExpression: { body: 1, parameters: 2 },
                    CallExpression: { arguments: 1 },
                    ArrayExpression: 1,
                    ObjectExpression: 1,
                    ImportDeclaration: 1,
                    flatTernaryExpressions: false,
                    offsetTernaryExpressions: true
                }
            ],
            "linebreak-style": ["error", "unix"],
            quotes: "off",
            semi: "off",
            "no-unused-vars": [
                "warn",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_"
                }
            ],
            "no-console": "off",
            "no-undef": "error",
            "no-control-regex": "off",
            "no-prototype-builtins": "off",
            "no-redeclare": "off"
        }
    },
    {
        files: ["**/test/**/*.js", "**/*.test.js", "**/*.spec.js"],
        languageOptions: {
            globals: {
                describe: "readonly",
                it: "readonly",
                beforeAll: "readonly",
                afterAll: "readonly",
                beforeEach: "readonly",
                afterEach: "readonly",
                expect: "readonly",
                test: "readonly"
            }
        }
    }
];
