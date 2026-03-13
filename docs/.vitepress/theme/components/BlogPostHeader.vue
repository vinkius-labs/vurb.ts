<script setup>
import { useData, withBase } from 'vitepress'

const { frontmatter } = useData()

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<template>
  <article class="blog-post-header">
    <div class="blog-post-meta">
      <time v-if="frontmatter.date" :datetime="String(frontmatter.date).slice(0, 10)">
        {{ formatDate(frontmatter.date) }}
      </time>
      <span v-if="frontmatter.author" class="blog-post-author">
        · <a v-if="frontmatter.authorUrl" :href="frontmatter.authorUrl" target="_blank" rel="noopener noreferrer" class="blog-post-author-link">{{ frontmatter.author }}</a>
        <template v-else>{{ frontmatter.author }}</template>
      </span>
    </div>
    <h1 class="blog-post-title">{{ frontmatter.title }}</h1>
    <p v-if="frontmatter.description" class="blog-post-desc">
      {{ frontmatter.description }}
    </p>
    <div class="blog-post-tags" v-if="frontmatter.tags?.length">
      <a
        v-for="tag in frontmatter.tags"
        :key="tag"
        :href="withBase(`/blog/?tag=${encodeURIComponent(tag)}`)"
        class="blog-post-tag"
      >
        {{ tag }}
      </a>
    </div>
  </article>
</template>

<style scoped>
.blog-post-header {
  margin-bottom: 2rem;
  padding-bottom: 1.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.blog-post-meta {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.75rem;
}

.blog-post-author {
  color: rgba(255, 255, 255, 0.35);
}

.blog-post-author-link {
  color: rgba(255, 255, 255, 0.45);
  text-decoration: none;
  transition: color 0.2s;
}

.blog-post-author-link:hover {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: underline;
}

.blog-post-title {
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 0.65rem;
}

.blog-post-desc {
  font-size: 1.05rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  max-width: 640px;
}

.blog-post-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 1rem;
}

.blog-post-tag {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.45);
  text-transform: lowercase;
  text-decoration: none;
  transition: background 0.2s, color 0.2s;
}

.blog-post-tag:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
}
</style>
