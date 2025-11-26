<script lang="ts">
  import { _ } from '../../lib/i18n'
  import AppIcon from '../icons/AppIcon.svelte'
</script>

<div class="about-section">
  <div class="about-icon-wrap">
    <AppIcon size={100} animate ariaLabel="Agasteer" />
  </div>
  <p>{$_('settings.about.description')}</p>
  <p class="author">
    {$_('settings.about.author')}: <strong>kako-jun</strong>
    <a
      href="https://github.com/kako-jun/simplest-note-md"
      target="_blank"
      rel="noopener noreferrer"
      title="GitHub"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path
          d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
        />
      </svg>
    </a>
    <a href="https://llll-ll.com" target="_blank" rel="noopener noreferrer" title="Homepage">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    </a>
  </p>
  <div class="support-section">
    <a
      href="https://github.com/sponsors/kako-jun"
      target="_blank"
      rel="noopener noreferrer"
      class="support-link"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        class="heart-icon"
      >
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
      <span>Sponsor on GitHub</span>
    </a>
  </div>
</div>

<style>
  .about-section {
    margin-top: 3rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.9rem;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .about-icon-wrap {
    display: inline-flex;
    width: 100px;
    align-items: center;
    justify-content: center;
    margin: 0 auto 1rem;
  }

  .about-section p {
    margin: 1rem 0;
    line-height: 1.6;
  }

  .author {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem !important;
  }

  .author a {
    color: var(--text);
    display: flex;
    align-items: center;
    transition: color 0.2s;
  }

  .author a:hover {
    color: var(--accent);
  }

  .support-section {
    margin-top: 0;
    margin-bottom: 3rem;
  }

  .support-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    color: var(--text);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .support-link:hover {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .heart-icon {
    flex-shrink: 0;
    animation: heartbeat 1.5s ease-in-out infinite;
  }

  @keyframes heartbeat {
    0%,
    100% {
      transform: scale(1);
    }
    10%,
    30% {
      transform: scale(1.1);
    }
    20%,
    40% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .heart-icon {
      animation: none;
    }
  }
</style>
