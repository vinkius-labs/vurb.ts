import { createContentLoader } from 'vitepress'

export interface PostData {
  title: string
  date: string
  author: string
  authorUrl?: string
  description: string
  tags: string[]
  image?: string
  url: string
}

declare const data: PostData[]
export { data }

export default createContentLoader('blog/posts/*.md', {
  transform(rawData): PostData[] {
    return rawData
      .map((page) => ({
        title: page.frontmatter.title ?? 'Untitled',
        date: page.frontmatter.date
          ? new Date(page.frontmatter.date).toISOString().slice(0, 10)
          : '',
        author: page.frontmatter.author ?? '',
        authorUrl: page.frontmatter.authorUrl ?? '',
        description: page.frontmatter.description ?? '',
        tags: page.frontmatter.tags ?? [],
        image: page.frontmatter.image ?? '',
        url: page.url,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  },
})
