<script lang="ts">
  // __BUILD_DATE__ is injected at build time by Vite (vite.config.ts)
  const buildDate = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev'
</script>

<div class="version">v{buildDate}</div>

<style>
  .version {
    position: absolute;
    bottom: 0.5rem;
    right: 1rem;
    font-size: 0.75rem;
    color: var(--text-muted);
    opacity: 0.6;
  }
</style>
