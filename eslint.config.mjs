import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,

    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
        },
        rules: {
            "no-unused-vars": "warn",
            "no-undef": "warn"
        }
    },

    {
        files: ["MMM-RainRadarDWD.js"],
        languageOptions: {
            globals: {
                ...globals.browser,
                Module: "readonly",
                Log: "readonly",
                ol: "readonly"
            }
        }
    },

    {
        files: ["node_helper.js"],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    }
];
