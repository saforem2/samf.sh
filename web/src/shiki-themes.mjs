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
    displayName: 'Lush OneLight',
    // Derived from mbph /tmp/lushify-onelight.lua (the active Nvim/Lush
    // light theme). Keep textmate scopes broadly grouped by treesitter role
    // so the web theme tracks the editor instead of inventing its own roles.
    foreground: '#444444',
    background: '#FAFAFA',
    rules: [
        // comments / punctuation — Comment / Delimiter
        [['comment', 'punctuation.definition.comment'], '#9B9FA6'],
        [['punctuation', 'punctuation.separator'], '#6A6A6A'],
        [
            [
                'punctuation.definition.string.begin',
                'punctuation.definition.string.end',
            ],
            '#1DA912',
        ],
        // @variable — Identifier-ish body text
        [['variable', 'variable.other.readwrite'], '#444444'],
        // @variable.member / @property
        [['variable.other.member', 'variable.other.property'], '#E05661'],
        // @variable.parameter — Lush @variable.parameter is #e05661
        [['variable.parameter'], '#E05661'],
        // List[float] in an annotation: TextMate scopes the callee name as
        // meta.indexed-name.python under meta.item-access.python (not as a type).
        // Scope it to parameter annotations so `nums[0]` stays default-colored,
        // and paint it with the type color since it IS a type there.
        [
            [
                'meta.function.parameters.python meta.indexed-name.python',
                'meta.function.parameters.python meta.item-access.python',
            ],
            '#EEA825',
        ],
        // function params: def f(<this>) — Lush @variable.parameter is #e05661
        [
            [
                'variable.parameter.function',
                'variable.parameter.function.language.python',
            ],
            '#E05661',
        ],
        // make sure def/class read as keywords (mauve), not type-amber
        [
            [
                'storage.type.function',
                'storage.type.class',
                'storage.type.function.python',
                'storage.type.class.python',
            ],
            '#9A77CF',
        ],
        // @variable.builtin (self/this) — @variable.builtin is eeaa25 in Lush
        [['variable.language'], '#EEA825'],
        // numbers / constants — Number / @number
        [
            [
                'constant.numeric',
                'constant.character',
                'constant.character.escape',
            ],
            '#EE9025',
        ],
        [
            ['constant.numeric.shell', 'constant.numeric.integer.shell'],
            '#EE9025',
        ],
        // @constant.builtin / True, False, None — Lush purple @constant.builtin
        [['constant.language', 'constant.language.python'], '#9A77CF'],
        [['constant.language.boolean', 'constant.language.null'], '#9A77CF'],
        // strings — String (#1da912); @string interpolation stays orange-ish in editor,
        // but keep the common path green so literals read as strings.
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
        // @operator — Operator #56b6c2
        [['keyword.operator', 'punctuation.accessor'], '#56B6C2'],
        // keywords — Keyword / Statement / Conditional / Repeat
        [
            [
                'keyword',
                'keyword.control',
                'keyword.declaration',
                'keyword.control.import',
                'keyword.control.from',
                'keyword.control.conditional',
                'keyword.control.flow',
                'keyword.control.repeat',
            ],
            '#9A77CF',
        ],
        // storage/types-as-keywords — Lush keyword.type is amber; keep types amber
        [['storage.type', 'storage.modifier', 'keyword.type'], '#EEA825'],
        // @type / annotations — Type #eea825
        [
            [
                'entity.name.type',
                'support.type',
                'meta.type',
                'support.type.primitive',
                'support.type.python',
            ],
            '#EEA825',
        ],
        // @module — #01a9f4
        [
            [
                'entity.name.namespace',
                'support.module',
                'entity.name.namespace.python',
            ],
            '#01A9F4',
        ],
        // @function / defs — Function #118dc3
        [
            [
                'entity.name.function',
                'entity.name.function.python',
                'entity.name.function.method',
                'entity.name.function.method.python',
                'support.function',
            ],
            '#118DC3',
        ],
        // @function.call / @function.method.call — @function.call #ec407a
        [
            [
                'meta.function-call',
                'meta.function-call.generic',
                'meta.function-call.python',
                'meta.method-call',
                'meta.method-call.python',
                'entity.name.function.call',
                'variable.function',
            ],
            '#EC407A',
        ],
        // @function.builtin — #1da912
        [
            ['support.function.builtin', 'support.function.builtin.python'],
            '#1DA912',
        ],
        // @attribute / decorators — Attribute #9a77cf
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
    displayName: 'Lush Dark',
    // Derived from mbph /tmp/lushify-dark.lua (the active Nvim/Lush dark
    // theme). Keep textmate scopes grouped by treesitter role; canvas stays
    // the Kitty #1c1c1c background.
    foreground: '#FFFFFF',
    background: '#1C1C1C',
    rules: [
        // comments — Comment #7b8496
        [['comment', 'punctuation.definition.comment'], '#7B8496'],
        // punctuation — Delimiter is #ffffff in Lush; keep structural punctuation quiet on screen
        [['punctuation', 'punctuation.separator'], '#B3B3B3'],
        [
            [
                'punctuation.definition.string.begin',
                'punctuation.definition.string.end',
            ],
            '#5EFF6C',
        ],
        // @variable / Identifier — #ffffff
        [['variable', 'variable.other.readwrite'], '#FFFFFF'],
        // @property / @field — Identifier
        [['variable.other.member', 'variable.other.property'], '#FFFFFF'],
        // Lush @parameter -> Identifier #ffffff
        [['variable.parameter'], '#FFFFFF'],
        // annotation subscripts — type context, not plain subscripts like nums[0]
        [
            [
                'meta.function.parameters.python meta.indexed-name.python',
                'meta.function.parameters.python meta.item-access.python',
            ],
            '#BD5EFF',
        ],
        // parameter names — Lush Identifier is #ffffff
        [
            [
                'variable.parameter.function',
                'variable.parameter.function.language.python',
            ],
            '#FFFFFF',
        ],
        // def/class as keywords (Statement/Keyword), not Type
        [
            [
                'storage.type.function',
                'storage.type.class',
                'storage.type.function.python',
                'storage.type.class.python',
            ],
            '#FFBD5E',
        ],
        // @variable.builtin -> Special #ff5ea0
        [['variable.language'], '#FF5EA0'],
        // Number / Float / @number — #ffbd5e
        [
            [
                'constant.numeric',
                'constant.character',
                'constant.character.escape',
            ],
            '#FFBD5E',
        ],
        [
            ['constant.numeric.shell', 'constant.numeric.integer.shell'],
            '#FFBD5E',
        ],
        // Constant / @constant — #ff5ea0
        [['constant.character.other', 'constant.other'], '#FF5EA0'],
        // @constant.builtin / True/False/None — Special in Lush (python keeps purple upstream in role file)
        [['constant.language', 'constant.language.python'], '#FF5EA0'],
        [['constant.language.boolean', 'constant.language.null'], '#5EF1FF'],
        // String / @string — #5eff6c
        [['string'], '#5EFF6C'],
        [
            ['string.quoted', 'string.template', 'string.interpolated'],
            '#5EFF6C',
        ],
        [['string.regexp', 'string.regexp.python'], '#5EFF6C'],
        [
            ['string.unquoted.argument.shell', 'string.unquoted.argument'],
            '#B3B3B3',
        ],
        // @operator — Operator #bd5eff
        [['keyword.operator', 'punctuation.accessor'], '#BD5EFF'],
        // keywords — Statement #ff5ef1; keyword.type/control stay #ffbd5e where Lush does that
        // Lush: Keyword (def/return/etc baseline) is Keyword #ffbd5e for @keyword.function,
        // but Statement is #ff5ef1 for Conditional/Repeat. Split that way.
        [
            [
                'keyword.control.conditional',
                'keyword.control.flow',
                'keyword.control.repeat',
                'keyword.control.loop',
                'keyword.control.exception',
            ],
            '#FF5EF1',
        ],
        [
            [
                'keyword.control.import',
                'keyword.control.from',
                'keyword.control.import.python',
                'keyword.control.flow.python',
                'keyword.control.conditional.python',
                'keyword.control.repeat.python',
                'keyword.control.exception.python',
                'keyword',
                'keyword.declaration',
                'keyword.control',
            ],
            '#FFBD5E',
        ],
        // storage/types-as-keywords — Type #bd5eff
        [['storage.type', 'storage.modifier'], '#BD5EFF'],
        // @type / annotations — Type #bd5eff
        [
            [
                'entity.name.type',
                'support.type',
                'meta.type',
                'support.type.primitive',
                'support.type.python',
            ],
            '#BD5EFF',
        ],
        // type.builtin — #d45edd in Lush
        [['support.type.builtin'], '#D45EDD'],
        // @module — #ff5ef1
        [
            [
                'entity.name.namespace',
                'support.module',
                'entity.name.namespace.python',
            ],
            '#FF5EF1',
        ],
        // @function — Function #5ea1ff
        [
            [
                'entity.name.function',
                'entity.name.function.python',
                'entity.name.function.method',
                'entity.name.function.method.python',
                'support.function',
            ],
            '#5EA1FF',
        ],
        // @function.call — no distinct Lush capture; keep blue for defs/calls, unlike light theme,
        // to match the editor where calls are also Function-colored.
        [
            [
                'meta.function-call',
                'meta.function-call.generic',
                'meta.function-call.python',
                'meta.method-call',
                'meta.method-call.python',
                'entity.name.function.call',
                'variable.function',
            ],
            '#5EA1FF',
        ],
        // @function.builtin — Function #5ea1ff
        [
            ['support.function.builtin', 'support.function.builtin.python'],
            '#5EA1FF',
        ],
        // @attribute / decorators — PreProc #5ef1ff
        [['entity.other.attribute-name', 'meta.function.decorator'], '#5EF1FF'],
        // shell / flags
        [['entity.name.function.call.shell'], '#5EA1FF'],
        [
            ['constant.other.option', 'constant.other.option.dash.shell'],
            '#5EF1FF',
        ],
    ],
})
