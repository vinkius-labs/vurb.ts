<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { data as posts } from '../../../blog/posts.data.mts'
import { withBase, useRouter } from 'vitepress'

const activeTag = ref('')
const router = useRouter()

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// Collect all unique tags
const allTags = computed(() => {
  const tagSet = new Set()
  posts.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)))
  return [...tagSet].sort()
})

// Filter posts by active tag
const filteredPosts = computed(() => {
  if (!activeTag.value) return posts
  return posts.filter(p => (p.tags || []).includes(activeTag.value))
})

function setTag(tag) {
  if (activeTag.value === tag) {
    activeTag.value = ''
    history.replaceState(null, '', withBase('/blog/'))
  } else {
    activeTag.value = tag
    history.replaceState(null, '', withBase(`/blog/?tag=${encodeURIComponent(tag)}`))
  }
}

function clearTag() {
  activeTag.value = ''
  history.replaceState(null, '', withBase('/blog/'))
}

// Read tag from URL on mount
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const tag = params.get('tag')
  if (tag) activeTag.value = tag
})
</script>

<template>
  <div class="blog-index">
    <!-- Hero -->
    <div class="blog-hero">
      <div class="blog-hero-grid"></div>
      <div class="blog-hero-glow"></div>
      <div class="blog-hero-content">
        <div class="blog-hero-badge">Engineering Blog</div>
        <h1 class="blog-hero-title">Building the future<br />of Agentic Infrastructure</h1>
        <div class="blog-hero-accent"></div>
        <p class="blog-hero-desc">
          Architecture decisions, protocol internals, and production patterns<br class="hide-mobile" />
          from the team behind Vurb.ts.
        </p>
        <div class="blog-hero-stats">
          <div class="blog-hero-stat">
            <span class="stat-value">Open Source</span>
            <span class="stat-label">Apache 2.0</span>
          </div>
          <div class="stat-divider"></div>
          <div class="blog-hero-stat">
            <span class="stat-value">TypeScript</span>
            <span class="stat-label">End-to-End</span>
          </div>
          <div class="stat-divider"></div>
          <div class="blog-hero-stat">
            <span class="stat-value">MVA</span>
            <span class="stat-label">Architecture</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tag filter bar -->
    <div class="blog-tag-bar" v-if="allTags.length">
      <button
        v-for="tag in allTags"
        :key="tag"
        class="blog-tag-btn"
        :class="{ active: activeTag === tag }"
        @click="setTag(tag)"
      >
        {{ tag }}
      </button>
      <button
        v-if="activeTag"
        class="blog-tag-clear"
        @click="clearTag"
      >
        ✕ clear
      </button>
    </div>

    <!-- Active filter indicator -->
    <div class="blog-filter-info" v-if="activeTag">
      <span>Showing posts tagged <strong>{{ activeTag }}</strong></span>
      <span class="blog-filter-count">{{ filteredPosts.length }} {{ filteredPosts.length === 1 ? 'article' : 'articles' }}</span>
    </div>

    <!-- Post listing -->
    <div class="blog-grid">
      <a
        v-for="post in filteredPosts"
        :key="post.url"
        :href="withBase(post.url)"
        class="blog-card"
      >
        <div class="blog-card-body">
          <div class="blog-card-meta">
            <time :datetime="post.date">{{ formatDate(post.date) }}</time>
            <span v-if="post.author" class="blog-card-author">
              · <a v-if="post.authorUrl" :href="post.authorUrl" target="_blank" rel="noopener noreferrer" class="blog-card-author-link" @click.stop>{{ post.author }}</a>
              <template v-else>{{ post.author }}</template>
            </span>
          </div>
          <h2 class="blog-card-title">{{ post.title }}</h2>
          <p class="blog-card-desc">{{ post.description }}</p>
          <div class="blog-card-tags" v-if="post.tags?.length">
            <button
              v-for="tag in post.tags"
              :key="tag"
              class="blog-tag"
              :class="{ active: activeTag === tag }"
              @click.prevent.stop="setTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>
        <div class="blog-card-arrow">→</div>
      </a>
    </div>

    <!-- Empty state -->
    <div class="blog-empty" v-if="activeTag && filteredPosts.length === 0">
      <p>No articles found for tag <strong>{{ activeTag }}</strong>.</p>
      <button class="blog-tag-clear" @click="clearTag">Show all articles</button>
    </div>
  </div>
</template>

<style scoped>
.blog-index {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 1.5rem 4rem;
}

/* ── Hero ── */
.blog-hero {
  position: relative;
  padding: 4rem 0 3rem;
  margin-bottom: 2.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.blog-hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%);
  -webkit-mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 100%);
  pointer-events: none;
}

.blog-hero-glow {
  position: absolute;
  top: -30%;
  left: 50%;
  transform: translateX(-50%);
  width: 480px;
  height: 320px;
  background: radial-gradient(ellipse at center, rgba(148, 163, 184, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.blog-hero-content {
  position: relative;
  text-align: center;
  z-index: 1;
}

.blog-hero-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 0.35rem 1rem;
  margin-bottom: 1.5rem;
  background: rgba(255, 255, 255, 0.03);
}

.blog-hero-title {
  font-size: 2.75rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  background: linear-gradient(180deg, #ffffff 20%, #64748b 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 1.25rem;
  line-height: 1.15;
}

.blog-hero-accent {
  width: 48px;
  height: 2px;
  margin: 0 auto 1.25rem;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.1), rgba(148, 163, 184, 0.5), rgba(148, 163, 184, 0.1));
  animation: accent-pulse 4s ease-in-out infinite;
}

@keyframes accent-pulse {
  0%, 100% { opacity: 0.6; width: 48px; }
  50% { opacity: 1; width: 64px; }
}

.blog-hero-desc {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.65;
  margin-bottom: 2rem;
}

.hide-mobile {
  display: none;
}

@media (min-width: 640px) {
  .hide-mobile {
    display: inline;
  }
}

.blog-hero-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
}

.blog-hero-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.stat-value {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.01em;
}

.stat-label {
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.25);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.stat-divider {
  width: 1px;
  height: 28px;
  background: rgba(255, 255, 255, 0.08);
}

/* ── Tag Bar ── */
.blog-tag-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.blog-tag-btn {
  all: unset;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.3rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.45);
  text-transform: lowercase;
  transition: all 0.2s;
}

.blog-tag-btn:hover {
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.06);
}

.blog-tag-btn.active {
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
}

.blog-tag-clear {
  all: unset;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0.3rem 0.65rem;
  border-radius: 9999px;
  color: rgba(255, 255, 255, 0.35);
  transition: color 0.2s;
}

.blog-tag-clear:hover {
  color: rgba(255, 255, 255, 0.6);
}

/* ── Filter Info ── */
.blog-filter-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.82rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.blog-filter-count {
  color: rgba(255, 255, 255, 0.25);
  font-size: 0.75rem;
}

/* ── Post Grid ── */
.blog-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}

@media (min-width: 640px) {
  .blog-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.blog-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.25s, background 0.25s, transform 0.25s;
}

.blog-card:hover {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-2px);
}

.blog-card-meta {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.35);
  margin-bottom: 0.65rem;
}

.blog-card-author {
  color: rgba(255, 255, 255, 0.3);
}

.blog-card-author-link {
  color: rgba(255, 255, 255, 0.4);
  text-decoration: none;
  transition: color 0.2s;
}

.blog-card-author-link:hover {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: underline;
}

.blog-card-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 0.5rem;
  line-height: 1.35;
}

.blog-card-desc {
  font-size: 0.88rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.55;
  flex: 1;
}

.blog-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.85rem;
}

.blog-tag {
  all: unset;
  cursor: pointer;
  font-size: 0.72rem;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.4);
  text-transform: lowercase;
  transition: all 0.2s;
}

.blog-tag:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.blog-tag.active {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.blog-card-arrow {
  margin-top: 1rem;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.15);
  transition: color 0.25s, transform 0.25s;
  align-self: flex-end;
}

.blog-card:hover .blog-card-arrow {
  color: rgba(255, 255, 255, 0.5);
  transform: translateX(4px);
}

/* ── Empty State ── */
.blog-empty {
  text-align: center;
  padding: 3rem 0;
  color: rgba(255, 255, 255, 0.35);
}

.blog-empty p {
  margin-bottom: 1rem;
}
</style>
