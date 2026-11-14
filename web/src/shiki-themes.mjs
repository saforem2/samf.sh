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
        ...base.tokenColors,
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
    displayName: 'Vim / Kitty Light',
    // Onelight's Normal foreground and the light Kitty background.
    foreground: '#6A6A6A',
    background: '#FFFFFF',
    rules: [
        // Onelight/auto-dark-mode.lua explicit Tree-sitter highlight colors.
        [['variable', 'variable.other.readwrite'], '#444444'],
        [['variable.other.member', 'variable.other.property'], '#EA76CB'],
        [['string'], '#FD971F'],
        [['support.function.builtin'], '#1DA912'],
        [['constant.language.python', 'constant.other.python'], '#F92672'],
        [['entity.name.namespace', 'support.module'], '#01A9F4'],
        [['entity.name.function', 'meta.function-call'], '#EC407A'],
    ],
})

export const customDarkTheme = withOverrides(nvimDarkRole, {
    name: 'custom-dark',
    displayName: 'Vim / Kitty Dark',
    // Cyberdream's local Normal override and the matching Kitty background.
    foreground: '#B3B3B3',
    background: '#1C1C1C',
    rules: [
        // cyberdream.lua / auto-dark-mode.lua explicit highlight overrides.
        [['comment', 'punctuation.definition.comment'], '#5F6972'],
        [['string'], '#99FFA2'],
        [['keyword'], '#00CCFF'],
        [['keyword.control.import', 'keyword.control.from'], '#D3FF3B'],
        [['keyword.control.conditional'], '#FF3BD3'],
        [['storage.type'], '#00CCFF'],
        [['keyword.type'], '#E599F7'],
        [['variable.other.property'], '#FA99CD'],
    ],
})
