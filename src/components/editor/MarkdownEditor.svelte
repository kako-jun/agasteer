<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { ThemeType } from '../../lib/types'
  import type { Pane } from '../../lib/navigation'
  import { isDirty } from '../../lib/stores'

  export let content: string
  export let theme: ThemeType
  export let vimMode: boolean = false
  export let linedMode: boolean = false
  export let pane: Pane
  export let onChange: (newContent: string) => void
  export let onSave: (() => void) | null = null
  export let onClose: (() => void) | null = null
  export let onSwitchPane: (() => void) | null = null
  export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

  let editorContainer: HTMLDivElement
  let editorView: any = null
  let currentExtensions: any[] = []
  let isScrollingSynced = false // スクロール同期中フラグ（無限ループ防止）
  let isLoading = true // CodeMirrorローディング中フラグ

  // 動的インポート用の変数
  let EditorState: any
  let EditorView: any
  let keymap: any
  let defaultKeymap: any
  let history: any
  let historyKeymap: any
  let markdown: any
  let basicSetup: any
  let vim: any
  let Vim: any
  let lineNumbers: any
  let HighlightStyle: any
  let syntaxHighlighting: any
  let tags: any

  // 外部からスクロール位置を設定する関数
  export function scrollTo(scrollTop: number) {
    if (!editorView || isScrollingSynced) return

    isScrollingSynced = true
    const scroller = editorView.scrollDOM
    if (scroller) {
      scroller.scrollTop = scrollTop
    }
    // 次のイベントループでフラグをリセット
    setTimeout(() => {
      isScrollingSynced = false
    }, 0)
  }

  // 外部からエディタにフォーカスを当てる関数
  export function focus() {
    if (editorView) {
      editorView.focus()
    }
  }

  const darkThemes: ThemeType[] = ['greenboard', 'dotsD', 'dotsF']

  // CodeMirrorモジュールを動的ロード
  async function loadCodeMirror() {
    const [
      { EditorState: ES },
      { EditorView: EV, keymap: km, lineNumbers: ln },
      { defaultKeymap: dk, history: h, historyKeymap: hk },
      { markdown: md },
      { basicSetup: bs },
      { vim: v, Vim: V },
      { HighlightStyle: HS, syntaxHighlighting: sh },
    ] = await Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/commands'),
      import('@codemirror/lang-markdown'),
      import('codemirror'),
      import('@replit/codemirror-vim'),
      import('@codemirror/language'),
    ])

    EditorState = ES
    EditorView = EV
    keymap = km
    defaultKeymap = dk
    history = h
    historyKeymap = hk
    markdown = md
    basicSetup = bs
    vim = v
    Vim = V
    lineNumbers = ln
    HighlightStyle = HS
    syntaxHighlighting = sh
    tags = (await import('@lezer/highlight')).tags
    isLoading = false
  }

  // CodeMirrorライトテーマ（テーマのCSS変数に追従）
  function createEditorLightTheme() {
    return EditorView.theme({
      '&': {
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        border: 'none',
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'var(--selection)',
        color: 'var(--text)',
        mixBlendMode: 'normal',
        opacity: 1,
      },
      '.cm-activeLine .cm-selectionBackground': {
        backgroundColor: 'var(--selection) !important',
        color: 'var(--text)',
        mixBlendMode: 'normal',
        opacity: 1,
      },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--surface-1) 60%, transparent 40%)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--bg)',
        color: 'var(--text-muted)',
        border: 'none',
        padding: '0 8px 0 0',
      },
      '.cm-gutterElement': {
        display: 'flex',
        alignItems: 'center',
        lineHeight: '1.6',
        padding: '6px 0',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--surface-1)',
      },
    })
  }

  // CodeMirrorダークテーマ（テーマのCSS変数に追従）
  function createEditorDarkTheme() {
    return EditorView.theme(
      {
        '&': {
          backgroundColor: 'var(--bg)',
          color: 'var(--text)',
          border: 'none',
        },
        '.cm-content': {
          caretColor: 'var(--accent)',
        },
        '.cm-cursor, .cm-dropCursor': {
          borderLeftColor: 'var(--accent)',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--selection)',
          color: 'var(--text)',
          mixBlendMode: 'normal',
          opacity: 1,
        },
        '.cm-activeLine .cm-selectionBackground': {
          backgroundColor: 'var(--selection) !important',
          color: 'var(--text)',
          mixBlendMode: 'normal',
          opacity: 1,
        },
        '.cm-activeLine': {
          backgroundColor: 'color-mix(in srgb, var(--surface-1) 60%, transparent 40%)',
        },
        '.cm-gutters': {
          backgroundColor: 'var(--bg)',
          color: 'var(--text-muted)',
          border: 'none',
          padding: '0 8px 0 0',
        },
        '.cm-gutterElement': {
          display: 'flex',
          alignItems: 'center',
          lineHeight: '1.6',
          padding: '6px 0',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--surface-1)',
        },
      },
      { dark: true }
    )
  }

  function createLinedTheme(isDark: boolean) {
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
    return EditorView.theme(
      {
        '.cm-line': {
          lineHeight: '1.6',
          padding: '6px 0 6px 0',
          borderBottom: `1px solid ${borderColor}`,
        },
        '.cm-gutters': {
          borderRight: `1px solid ${borderColor}`,
        },
      },
      isDark ? { dark: true } : {}
    )
  }

  function createMarkdownHighlightStyle() {
    if (!HighlightStyle || !syntaxHighlighting || !tags) return null
    return syntaxHighlighting(
      HighlightStyle.define([
        {
          tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
          color: 'var(--accent)',
        },
        { tag: [tags.list], color: 'var(--accent)' },
        { tag: [tags.quote], color: 'var(--text-muted)' },
        { tag: [tags.emphasis], color: 'var(--accent)' },
        { tag: [tags.strong], color: 'var(--accent)', fontWeight: '600' },
        { tag: [tags.link, tags.url], color: 'var(--accent)' },
        { tag: [tags.monospace], color: 'var(--text)' },
      ])
    )
  }

  function initializeEditor() {
    if (!editorContainer || editorView || isLoading) return

    const extensions = [
      basicSetup,
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString()
          onChange(newContent)
          // エディタで変更があったらダーティフラグを立てる（Push成功まで解除されない）
          isDirty.set(true)
        }
      }),
      EditorView.domEventHandlers({
        scroll: (event) => {
          if (isScrollingSynced || !onScroll) return
          const target = event.target as HTMLElement
          if (target) {
            onScroll(target.scrollTop, target.scrollHeight)
          }
        },
      }),
    ]

    // Vimモードが有効な場合は追加
    if (vimMode && vim && Vim) {
      // 拡張を追加してから定義する必要がある
      extensions.push(vim())

      // グローバルなコールバックマップを初期化（window経由で共有）
      if (typeof window !== 'undefined') {
        if (!window.editorCallbacks) {
          window.editorCallbacks = {}
        }
        window.editorCallbacks[pane] = {
          onSave,
          onClose,
          onSwitchPane,
        }
      }

      // エディタ初期化後にVimコマンドを定義（遅延実行）
      // Vimコマンドはグローバルなので、最初の1回だけ定義
      setTimeout(() => {
        if (!Vim) return

        // 初回のみVimコマンドを定義
        if (typeof window !== 'undefined' && !window.vimCommandsInitialized) {
          // 現在フォーカスされているエディタのペインを取得する関数
          const getCurrentPane = () => {
            const activeEditor = document.activeElement?.closest('.cm-editor')
            return activeEditor?.getAttribute('data-pane') || null
          }

          // :w コマンド - 実行時にpaneを判定
          Vim.defineEx('write', 'w', function () {
            const paneId = getCurrentPane()
            const callbacks = paneId ? window.editorCallbacks?.[paneId] : null
            if (callbacks?.onSave) {
              callbacks.onSave()
            }
          })

          // :wq コマンド - 保存後に閉じる
          Vim.defineEx('wq', 'wq', function () {
            const paneId = getCurrentPane()
            const callbacks = paneId ? window.editorCallbacks?.[paneId] : null
            if (callbacks?.onSave) {
              callbacks.onSave()
            }
            if (callbacks?.onClose) {
              setTimeout(() => {
                callbacks.onClose()
              }, 100)
            }
          })

          // :q コマンド - 閉じる
          Vim.defineEx('quit', 'q', function () {
            const paneId = getCurrentPane()
            const callbacks = paneId ? window.editorCallbacks?.[paneId] : null
            if (callbacks?.onClose) {
              callbacks.onClose()
            }
          })

          // スペースキーでペイン切り替え
          Vim.defineAction('switchPane', function () {
            const paneId = getCurrentPane()
            const callbacks = paneId ? window.editorCallbacks?.[paneId] : null
            if (callbacks?.onSwitchPane) {
              callbacks.onSwitchPane()
            }
          })
          Vim.mapCommand('<Space>', 'action', 'switchPane')

          window.vimCommandsInitialized = true
        }
      }, 100)
    }

    // ダーク系テーマの場合はエディタの配色も揃える
    if (darkThemes.includes(theme)) {
      extensions.push(createEditorDarkTheme())
      if (linedMode) {
        if (lineNumbers) extensions.push(lineNumbers())
        extensions.push(createLinedTheme(true))
      }
    } else {
      extensions.push(createEditorLightTheme())
      if (linedMode) {
        if (lineNumbers) extensions.push(lineNumbers())
        extensions.push(createLinedTheme(false))
      }
    }

    const mdHighlight = createMarkdownHighlightStyle()
    if (mdHighlight) {
      extensions.push(mdHighlight)
    }

    currentExtensions = extensions

    const startState = EditorState.create({
      doc: content,
      extensions: currentExtensions,
    })

    editorView = new EditorView({
      state: startState,
      parent: editorContainer,
    })

    // DOM要素にペイン情報をマーク（Vimコマンドで参照するため）
    editorView.dom.dataset.pane = pane

    // エディタにフォーカスを当てる
    editorView.focus()
  }

  function updateEditorContent(newContent: string) {
    if (!editorView) return

    const currentContent = editorView.state.doc.toString()
    if (currentContent === newContent) return

    const newState = EditorState.create({
      doc: newContent,
      extensions: currentExtensions,
    })

    editorView.setState(newState)
    // 注意: isDirtyはリセットしない（Push成功時のみリセットされる）
  }

  // テーマまたはVimモード変更時にエディタを再初期化
  $: if (editorView && (theme || vimMode !== undefined || linedMode !== undefined)) {
    editorView.destroy()
    editorView = null
    initializeEditor()
  }

  // contentが外部から変更された時にエディタを更新
  $: if (editorView && content !== undefined) {
    updateEditorContent(content)
  }

  onMount(async () => {
    await loadCodeMirror()
    initializeEditor()
  })

  onDestroy(() => {
    if (editorView) {
      editorView.destroy()
    }
  })
</script>

{#if isLoading}
  <div class="loading-container">
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>
{:else}
  <div bind:this={editorContainer} class="editor-container"></div>
{/if}

<style>
  .loading-container {
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: var(--bg);
  }

  .loading-dots {
    display: flex;
    gap: 0.5rem;
  }

  .loading-dots span {
    width: 12px;
    height: 12px;
    background-color: var(--accent);
    border-radius: 50%;
    animation: pulse 1.4s infinite ease-in-out both;
  }

  .loading-dots span:nth-child(1) {
    animation-delay: -0.32s;
  }

  .loading-dots span:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes pulse {
    0%,
    80%,
    100% {
      transform: scale(0);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .editor-container {
    height: 100%;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  :global(.cm-editor) {
    height: 100%;
    border: none !important;
    outline: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  :global(.cm-scroller) {
    overflow: auto;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
    margin: 0 !important;
    padding: 0 !important;
  }

  :global(.cm-content) {
    padding: 0.5rem !important;
  }

  /* Vimコマンドラインのスタイル */
  :global(.cm-vim-panel) {
    padding: 0.5rem 0.5rem 0.4rem 0.5rem;
    background-color: var(--surface-1);
    color: var(--text);
    font-family: 'Courier New', monospace !important;
    font-size: 14px !important;
    line-height: 1 !important;
    border-top: 1px solid var(--border);
  }

  :global(.cm-vim-panel input) {
    background: transparent !important;
    border: none !important;
    outline: none !important;
    color: var(--text) !important;
    font-family: 'Courier New', monospace !important;
    font-size: 14px !important;
    line-height: 1 !important;
    padding: 0 !important;
    margin: 1px 0 0 0.25rem !important;
  }
</style>
