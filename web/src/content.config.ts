import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'

const docs = defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx}', base: './src/pages' }),
    schema: z.object({
        title: z.string(),
        // Shorter variant for tight contexts (e.g. the talks table on
        // /about) where the canonical title overflows. Falls back to
        // `title` when unset.
        shortTitle: z.string().optional(),
        order: z.number().nullish(),
        date: z.coerce.date().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        /* Optional URL for the venue/event named in `location`. Renders
           the location column on /talks/ as a link when set. */
        locationUrl: z.string().url().optional(),
        draft: z.boolean().optional(),
        /* The page's Astro layout, e.g. '@/layouts/SlideLayout.astro'. Every
           page already declares this in frontmatter, but the schema is strict
           so zod drops any field it does not name. Doc.astro reads it to tell
           slide decks (SlideLayout) apart from prose pages (Doc), since decks
           render no citation block and must not count toward citation-key
           collisions. */
        layout: z.string().optional(),
    }),
})

export const collections = { docs }
