import nvimDarkRole from './shiki/nvim-dark-role.json' with { type: 'json' }
import nvimLightRole from './shiki/nvim-light-role.json' with { type: 'json' }

// Keep the Vim/Kitty-matched themes in the existing custom light/dark slots.
// Shiki's theme name becomes the CSS variable prefix in highlighted markup.
export const customLightTheme = {
    ...nvimLightRole,
    displayName: 'Vim/Kitty Light',
    name: 'custom-light',
}

export const customDarkTheme = {
    ...nvimDarkRole,
    displayName: 'Vim/Kitty Dark',
    name: 'custom-dark',
}
