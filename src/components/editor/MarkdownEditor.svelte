<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EditorState } from '@codemirror/state'
  import { EditorView, keymap } from '@codemirror/view'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { basicSetup } from 'codemirror'
  import type { ThemeType } from '../../lib/types'

  export let content: string
  export let theme: ThemeType
  export let onChange: (newContent: string) => void

  let editorContainer: HTMLDivElement
  let editorView: EditorView | null = null
  let currentExtensions: any[] = []

  // CodeMirrorダークテーマ
  const editorDarkTheme = EditorView.theme(
    {
      '&': {
        backgroundColor: '#1a1a1a',
        color: '#e5e7eb',
      },
      '.cm-content': {
        caretColor: '#1f4d48',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: '#1f4d48',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: '#1f4d48',
      },
      '.cm-activeLine': {
        backgroundColor: '#2d2d2d',
      },
      '.cm-gutters': {
        backgroundColor: '#1a1a1a',
        color: '#9ca3af',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: '#2d2d2d',
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
          onChange(update.state.doc.toString())
        }
      }),
    ]

    // テーマがdarkの場合はダークテーマを追加
    if (theme === 'dark') {
      extensions.push(editorDarkTheme)
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
    overflow: auto;
  }

  :global(.cm-editor) {
    height: 100%;
  }

  :global(.cm-scroller) {
    overflow: auto;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.6;
  }
</style>
