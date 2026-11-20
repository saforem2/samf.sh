import nvimDarkRole from './shiki/nvim-dark-role.json' with { type: 'json' }
import nvimLightRole from './shiki/nvim-light-role.json' with { type: 'json' }

// These TextMate scope maps are based on the installed Onelight and Cyberdream
// themes. Keep them as the broad syntax foundation, then append the explicit
// highlight overrides from ~/.config/nvim/after/plugin/auto-dark-mode.lua and
// cyberdream.lua. The Kitty themes supply the matching #fff / #1c1c1c canvas;
// Vim supplies the foreground and syntax-role overrides.
const withOverrides = (
    base,
    { name, displayName, foreground, background, rules },
) => ({
    ...base,
    displayName,
    name,
    foreground,
    background,
    colors: {
        ...base.colors,
        'editor.background': background,
        'editor.foreground': foreground,
    },
    tokenColors: [
        {
            ...base.tokenColors[0],
            settings: {
                ...base.tokenColors[0].settings,
                foreground,
            },
        },
        ...base.tokenColors.slice(1),
        ...rules.map(([scope, color, fontStyle]) => ({
            scope,
            settings: {
                foreground: color,
                ...(fontStyle ? { fontStyle } : {}),
            },
        })),
    ],
})

export const customLightTheme = withOverrides(nvimLightRole, {
    name: 'custom-light',
    displayName: 'Light blend',
    // Derived from mbph /tmp/lushify-onelight.lua (the active Nvim/Lush
    // light theme). Keep textmate scopes broadly grouped by treesitter role
    // so the web theme tracks the editor instead of inventing its own roles.
    foreground: '#444444',
    background: '#FAFAFA',
    rules: [
        // comments / punctuation
        [['comment', 'punctuation.definition.comment'], '#9B9FA6'],
        [['punctuation.definition', 'punctuation.separator'], '#6A6A6A'],
        [
            [
                'punctuation.definition.string.begin',
                'punctuation.definition.string.end',
            ],
            '#1DA912',
        ],
        // text / identifiers — @variable
        [['variable', 'variable.other.readwrite'], '#444444'],
        // member access / properties — @variable.member / @property
        [['variable.other.member', 'variable.other.property'], '#E05661'],
        // parameters — @variable.parameter (and *.builtin stay default-ish)
        [['variable.parameter'], '#E05661'],
        // @variable.builtin (self/this/super)
        [['variable.language'], '#EEA825'],
        // constants / numbers — @constant / @number
        [
            [
                'constant.numeric',
                'constant.character',
                'constant.character.escape',
            ],
            '#EE9025',
        ],
        // @constant.builtin / python True, False, None -> Lush purple
        [['constant.language', 'constant.language.python'], '#9A77CF'],
        [
            ['constant.numeric.shell', 'constant.numeric.integer.shell'],
            '#EE9025',
        ],
        // @constant.builtin — theme keeps these purple
        [['constant.language.boolean', 'constant.language.null'], '#9A77CF'],
        // strings — Lush uses #1da912 for String, #fd971f for @string;
        // normal strings read better in the sheer role on the page.
        [['string'], '#1DA912'],
        [
            ['string.quoted', 'string.template', 'string.interpolated'],
            '#FD971F',
        ],
        [['string.regexp', 'string.regexp.python'], '#1DA912'],
        [
            ['string.unquoted.argument.shell', 'string.unquoted.argument'],
            '#6A6A6A',
        ],
        // operators / accessors — @operator / @operator.lua
        [['keyword.operator', 'punctuation.accessor'], '#56B6C2'],
        // keywords — @keyword / Conditional / Repeat / Include / Exception
        [
            [
                'keyword',
                'storage.type',
                'storage.modifier',
                'storage.type.function',
                'keyword.control',
                'keyword.declaration',
                'keyword.control.import',
                'keyword.control.from',
            ],
            '#9A77CF',
        ],
        // type annotations — @type (Lush uses #EEA825 here)
        [['entity.name.type', 'support.type', 'meta.type'], '#EEA825'],
        [['support.type.primitive', 'support.type.python'], '#EEA825'],
        // namespaces / modules — @module
        [
            [
                'entity.name.namespace',
                'support.module',
                'entity.name.namespace.python',
            ],
            '#01A9F4',
        ],
        // function definitions vs calls:
        // @function / @function.method -> #118dc3
        // @function.call / @function.method.call -> #ec407a (python inherits the blue; calls stay warm)
        [
            [
                'entity.name.function',
                'entity.name.function.python',
                'entity.name.function.method',
                'entity.name.function.method.python',
                'support.function',
                'meta.function-call',
            ],
            '#118DC3',
        ],
        [
            [
                'meta.function-call.generic',
                'meta.function-call.python',
                'meta.method-call',
                'meta.method-call.python',
                'entity.name.function.call',
                'variable.function',
            ],
            '#EC407A',
        ],
        // builtins — @function.builtin
        [
            ['support.function.builtin', 'support.function.builtin.python'],
            '#1DA912',
        ],
        // decorators — @attribute
        [['entity.other.attribute-name', 'meta.function.decorator'], '#9A77CF'],
        // shell / flags
        [['entity.name.function.call.shell'], '#01A9F4'],
        [
            ['constant.other.option', 'constant.other.option.dash.shell'],
            '#9A77CF',
        ],
    ],
})

export const customDarkTheme = withOverrides(nvimDarkRole, {
    name: 'custom-dark',
    displayName: 'Vim / Kitty Dark',
    // Cyberdream's local Normal override and the matching Kitty background.
    foreground: '#B3B3B3',
    background: '#1C1C1C',
    rules: [
        // Keep the dark Kitty canvas, readable foreground and the Cyberdream
        // blue/green accents, while using Lush roles for numbers, keywords,
        // control flow, imports and types.
        [['comment', 'punctuation.definition.comment'], '#7B8496'],
        [['string.unquoted.argument.shell'], '#B3B3B3'],
        [['entity.name.function.call.shell'], '#5EA1FF'],
        [
            ['constant.other.option', 'constant.other.option.dash.shell'],
            '#BE95FF',
        ],
        [
            ['constant.numeric.shell', 'constant.numeric.integer.shell'],
            '#FFBD5E',
        ],
        [['string'], '#99FFA2'],
        [['constant.numeric', 'constant.language'], '#FFBD5E'],
        [['constant.other', 'support.constant'], '#FF5EA0'],
        [['constant.language.boolean'], '#5EF1FF'],
        [['keyword'], '#FFBD5E'],
        [['keyword.control.import', 'keyword.control.from'], '#5EF1FF'],
        [['keyword.control.conditional'], '#FF5EF1'],
        [['storage.type', 'keyword.type'], '#BD5EFF'],
        [['variable.other.property'], '#FA99CD'],
    ],
})
