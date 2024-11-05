import globals from "globals";
import js from "@eslint/js";

export default [
    {
        // Set the language options for ECMAScript and CommonJS
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: "commonjs",
            globals: {
                ...globals.node,  // Includes Node.js globals like __dirname, require
            },
        },
    },
    js.configs.recommended,
    {
        rules: {
            // Core code quality rules
            "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true }],
            "no-console": "error",
            "consistent-return": "error",
            "curly": ["error", "all"],
            "eqeqeq": ["error", "always"],
            "no-var": "error",
            "prefer-const": "error",

            // Stylistic rules for readability and consistency
            "no-multi-spaces": "error",
            "semi": ["error", "always"],
            "quotes": ["error", "single", { avoidEscape: true }],
            "indent": ["error", 4, { SwitchCase: 2 }],
            "arrow-spacing": ["error", { before: true, after: true }],
            "space-before-function-paren": ["error", "never"],
            "keyword-spacing": ["error", { before: true, after: true }],
            "comma-dangle": ["error", "always-multiline"],
            "object-curly-spacing": ["error", "always"],
            "array-bracket-spacing": ["error", "never"],
            "block-spacing": ["error", "always"],
            "space-in-parens": ["error", "never"],
            "key-spacing": ["error", { beforeColon: false, afterColon: true }],
            "no-trailing-spaces": "error",
            "eol-last": ["error", "always"],
            "no-duplicate-imports": "error",
            "prefer-arrow-callback": ["error", { allowNamedFunctions: false }],
            "func-style": ["error", "declaration", { allowArrowFunctions: true }],
            "no-multiple-empty-lines": ["error", { max: 1 }],
            "space-infix-ops": "error",
            "no-lonely-if": "error",
            "dot-notation": ["error", { allowKeywords: true }],
            "yoda": ["error", "never"]
        },
    },
];
