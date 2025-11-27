<script lang="ts">
  import { _ } from '../../lib/i18n'
</script>

<div class="help-links">
  <a
    href="https://github.com/kako-jun/agasteer#readme"
    target="_blank"
    rel="noopener noreferrer"
    class="help-link"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
    <span>{$_('settings.help.text')}</span>
  </a>
  <a
    href="https://www.youtube.com/watch?v=example"
    target="_blank"
    rel="noopener noreferrer"
    class="help-link"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
    <span>{$_('settings.help.video')}</span>
  </a>
</div>

<style>
  .help-links {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .help-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    text-decoration: none;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .help-link:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .help-link svg {
    flex-shrink: 0;
  }
</style>
