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
    // Blend the soft Material Lighter / Onelight canvas with syntax accents
    // sampled from all four Vim themes.
    foreground: '#6A6A6A',
    background: '#FAFAFA',
    rules: [
        [['comment', 'punctuation.definition.comment'], '#9B9FA6'],
        [['variable', 'variable.other.readwrite'], '#444444'],
        [['variable.other.member', 'variable.other.property'], '#0F62FE'],
        // Separate the executable, flags, and ordinary arguments.
        [['entity.name.function.call.shell'], '#0F62FE'],
        [
            ['string.unquoted.argument.shell', 'string.unquoted.argument'],
            '#6A6A6A',
        ],
        [
            ['constant.other.option', 'constant.other.option.dash.shell'],
            '#673AB7',
        ],
        [['constant.numeric.shell'], '#0F62FE'],
        [['string'], '#2E7D32'],
        [['support.function.builtin'], '#2E7D32'],
        [['constant.language.python', 'constant.other.python'], '#673AB7'],
        [['entity.name.namespace', 'support.module'], '#0F62FE'],
        [['entity.name.function', 'meta.function-call'], '#673AB7'],
        [['keyword', 'storage.type'], '#673AB7'],
        [['constant.numeric', 'constant.language'], '#0F62FE'],
        [['entity.name.type', 'support.type'], '#0F62FE'],
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
