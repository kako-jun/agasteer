<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, keymap } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { basicSetup } from 'codemirror'
  import type { ThemeType } from '../../lib/types'
  import { isDirty } from '../../lib/stores'

  export let content: string
  export let theme: ThemeType
  export let onChange: (newContent: string) => void
  export let onScroll: ((scrollTop: number, scrollHeight: number) => void) | null = null

  let editorContainer: HTMLDivElement
  let editorView: EditorView | null = null
  let currentExtensions: any[] = []
  let isScrollingSynced = false // スクロール同期中フラグ（無限ループ防止）

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

  const darkThemes: ThemeType[] = ['greenboard', 'dotsD', 'dotsF']

  // CodeMirrorライトテーマ（テーマのCSS変数に追従）
  const editorLightTheme = EditorView.theme({
    '&': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      border: 'none',
    },
    '.cm-content': {
      caretColor: 'var(--accent-color)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent-color)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-secondary)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-primary)',
      color: 'var(--text-secondary)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-secondary)',
    },
  })

  // CodeMirrorダークテーマ（テーマのCSS変数に追従）
  const editorDarkTheme = EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        border: 'none',
      },
      '.cm-content': {
        caretColor: 'var(--accent-color)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--accent-color)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'color-mix(in srgb, var(--accent-color) 35%, transparent)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--bg-secondary)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--bg-secondary)',
      },
    },
    { dark: true }
  )

  function initializeEditor() {
    if (!editorContainer || editorView) return

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

    // ダーク系テーマの場合はエディタの配色も揃える
    if (darkThemes.includes(theme)) {
      extensions.push(editorDarkTheme)
    } else {
      extensions.push(editorLightTheme)
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

  // テーマ変更時にエディタを再初期化
  $: if (editorView && theme) {
    editorView.destroy()
    editorView = null
    initializeEditor()
  }

  // contentが外部から変更された時にエディタを更新
  $: if (editorView && content !== undefined) {
    updateEditorContent(content)
  }

  onMount(() => {
    initializeEditor()
  })

  onDestroy(() => {
    if (editorView) {
      editorView.destroy()
    }
  })
</script>

<div bind:this={editorContainer} class="editor-container"></div>

<style>
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
</style>
