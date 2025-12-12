<script lang="ts">
  import { onDestroy } from 'svelte'
  import { _ } from '../../lib/i18n'
  import {
    searchQuery,
    isSearchOpen,
    searchResults,
    handleSearchInput,
    closeSearch,
    clearSearch,
    selectNextResult,
    selectPrevResult,
    getSelectedResult,
    selectedResultIndex,
  } from '../../lib/utils'
  import type { SearchMatch } from '../../lib/types'

  // マッチタイプに応じたジャンプ処理
  export let onResultClick: (result: SearchMatch) => void

  let inputElement: HTMLInputElement
  let containerElement: HTMLDivElement
  let listenerRegistered = false

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      clearSearch() // クエリをクリア
      closeSearch()
      inputElement?.blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectNextResult()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectPrevResult()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      let result = getSelectedResult()
      if (!result && $searchResults.length > 0) {
        result = $searchResults[0]
      }
      if (result) {
        onResultClick(result)
        // 検索結果は閉じずに開いたままにする
      }
    }
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    handleSearchInput(target.value)
  }

  function handleClear() {
    clearSearch()
    inputElement?.focus()
  }

  function handleResultClick(result: SearchMatch) {
    onResultClick(result)
    // 検索結果は閉じずに開いたままにする
  }

  function handleClickOutside(e: MouseEvent) {
    // containerElementがまだ存在しない場合は無視
    if (!containerElement) return

    const target = e.target as Node

    // 検索ドロップダウン内のクリックは無視
    if (containerElement.contains(target)) return

    // ヘッダーの検索ボタンのクリックはトグルに任せる
    const button = (target as Element).closest?.('button')
    if (button) {
      const svg = button.querySelector('svg circle[cx="11"][cy="11"]')
      if (svg) return // toggleSearchが処理する
    }

    closeSearch()
  }

  // isSearchOpenの変化を監視してイベントリスナーを管理
  $: if ($isSearchOpen) {
    if (!listenerRegistered) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
        listenerRegistered = true
      }, 0)
    }
    setTimeout(() => inputElement?.focus(), 50)
  } else {
    if (listenerRegistered) {
      document.removeEventListener('click', handleClickOutside)
      listenerRegistered = false
    }
  }

  onDestroy(() => {
    if (listenerRegistered) {
      document.removeEventListener('click', handleClickOutside)
    }
  })
</script>

{#if $isSearchOpen}
  <div class="search-dropdown" bind:this={containerElement} role="search">
    <!-- 検索ボックス -->
    <div class="search-input-wrapper">
      <svg
        class="search-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        bind:this={inputElement}
        type="text"
        placeholder={$_('search.placeholder')}
        value={$searchQuery}
        on:input={handleInput}
        on:keydown={handleKeydown}
        aria-label={$_('search.placeholder')}
      />
      {#if $searchQuery}
        <button
          class="clear-button"
          on:click|stopPropagation={handleClear}
          title={$_('search.clear')}
          aria-label={$_('search.clear')}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      {/if}
    </div>

    <!-- 検索結果 -->
    {#if $searchQuery}
      <div class="search-results" role="listbox">
        {#if $searchResults.length > 0}
          {#each $searchResults as result, index}
            <button
              class="result-item"
              class:selected={index === $selectedResultIndex}
              role="option"
              aria-selected={index === $selectedResultIndex}
              on:click={() => handleResultClick(result)}
              on:mouseenter={() => selectedResultIndex.set(index)}
            >
              <div class="result-path">{result.path}</div>
              <div class="result-snippet">
                {result.snippet.slice(0, result.matchStart)}<mark
                  >{result.snippet.slice(result.matchStart, result.matchEnd)}</mark
                >{result.snippet.slice(result.matchEnd)}
              </div>
            </button>
          {/each}
        {:else}
          <div class="no-results">
            <span>{$_('search.noResults')}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .search-dropdown {
    position: absolute;
    top: 41px; /* ヘッダーの高さにくっつける */
    right: 0;
    width: 350px;
    max-width: 100vw;
    background: var(--bg);
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-top: none;
    border-right: none;
    border-radius: 0 0 0 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    overflow: hidden;
  }

  :global([data-theme='greenboard']) .search-dropdown,
  :global([data-theme='dotsD']) .search-dropdown,
  :global([data-theme='dotsF']) .search-dropdown {
    border-color: rgba(255, 255, 255, 0.2);
  }

  .search-input-wrapper {
    display: flex;
    align-items: center;
    padding: 0.6rem 0.8rem;
    gap: 0.5rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }

  :global([data-theme='greenboard']) .search-input-wrapper,
  :global([data-theme='dotsD']) .search-input-wrapper,
  :global([data-theme='dotsF']) .search-input-wrapper {
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }

  .search-icon {
    width: 16px;
    height: 16px;
    color: var(--text);
    opacity: 0.6;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    border: none;
    background: none;
    color: var(--text);
    font-size: 0.95rem;
    outline: none;
    min-width: 0;
  }

  input::placeholder {
    color: var(--text);
    opacity: 0.5;
  }

  .clear-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text);
    opacity: 0.6;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .clear-button:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  :global([data-theme='greenboard']) .clear-button:hover,
  :global([data-theme='dotsD']) .clear-button:hover,
  :global([data-theme='dotsF']) .clear-button:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .clear-button svg {
    width: 14px;
    height: 14px;
  }

  /* 検索結果 */
  .search-results {
    max-height: 60vh;
    overflow-y: auto;
  }

  .no-results {
    padding: 1rem;
    text-align: center;
    color: var(--text);
    opacity: 0.7;
  }

  .result-item {
    display: block;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    color: var(--text);
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-item:hover,
  .result-item.selected {
    background: rgba(0, 0, 0, 0.05);
  }

  :global([data-theme='greenboard']) .result-item:hover,
  :global([data-theme='greenboard']) .result-item.selected,
  :global([data-theme='dotsD']) .result-item:hover,
  :global([data-theme='dotsD']) .result-item.selected,
  :global([data-theme='dotsF']) .result-item:hover,
  :global([data-theme='dotsF']) .result-item.selected {
    background: rgba(255, 255, 255, 0.1);
  }

  .result-path {
    font-size: 0.8rem;
    font-weight: 400;
    opacity: 0.5;
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-snippet {
    font-size: 0.85rem;
    white-space: normal;
    word-break: break-all;
    line-height: 1.4;
  }

  .result-snippet mark {
    font-weight: 700;
    background: none;
    color: var(--accent);
  }

  @media (max-width: 400px) {
    .search-dropdown {
      right: 0;
      width: 100vw;
      border-radius: 0;
    }
  }
</style>
