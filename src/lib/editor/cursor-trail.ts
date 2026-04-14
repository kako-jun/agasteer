/**
 * カーソルトレイル（残像）描画機能
 * WebGL2 フラグメントシェーダーで Ghostty 風のカーソル残像を描画する CodeMirror 拡張
 */

import type { Extension } from '@codemirror/state'

// --- シェーダーソース ---

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec2 uCurrentCursor;   // 現在のカーソル位置 (px)
uniform vec2 uPreviousCursor;  // 前のカーソル位置 (px)
uniform vec2 uCursorSize;      // カーソルのサイズ (width, height in px)
uniform float uTime;           // 現在時刻 (秒)
uniform float uTimeCursorChange; // カーソル移動時のタイムスタンプ (秒)
uniform vec3 uAccentColor;     // アクセントカラー (RGB, 0-1)

out vec4 fragColor;

void main() {
  vec2 fragCoord = gl_FragCoord.xy;
  fragCoord.y = uResolution.y - fragCoord.y; // Y軸反転（Canvas座標系に合わせる）

  float elapsed = uTime - uTimeCursorChange;
  float duration = 0.5; // フェードアウト秒数

  if (elapsed > duration) {
    fragColor = vec4(0.0);
    return;
  }

  float t = clamp(elapsed / duration, 0.0, 1.0);
  float fade = pow(1.0 - t, 10.0); // 急峻なイージング

  // 前カーソル→現カーソルの軌跡上の最近点を計算
  vec2 ab = uCurrentCursor - uPreviousCursor;
  float abLen = length(ab);
  float halfW = uCursorSize.x * 0.5;
  float halfH = uCursorSize.y * 0.5;

  vec2 abDir = ab / max(abLen, 0.001);

  // 軌跡に沿った射影（共通計算）
  float proj = dot(fragCoord - uPreviousCursor, abDir);
  float s = clamp(proj / max(abLen, 0.001), 0.0, 1.0);

  float dist;
  if (abLen < 0.5) {
    // ほぼ移動していない: カーソル矩形のSDF
    vec2 d = abs(fragCoord - uCurrentCursor) - vec2(halfW, halfH);
    dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  } else {
    // 軌跡に沿ったSDF
    vec2 closest = uPreviousCursor + ab * s;
    vec2 d = abs(fragCoord - closest) - vec2(halfW, halfH);
    dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // smoothstep でアンチエイリアシング（2px幅）
  float alpha = 1.0 - smoothstep(0.0, 2.0, dist);

  // カーソルからの距離ベースの追加減衰（現カーソルに近いほど濃い）
  if (abLen > 0.5) {
    // s=0（前カーソル）で減衰、s=1（現カーソル）で最大
    alpha *= mix(0.3, 1.0, s);
  }

  alpha *= fade * 0.6; // 全体の透明度を控えめに

  fragColor = vec4(uAccentColor * alpha, alpha);
}
`

// --- ユーティリティ ---

function parseAccentColor(el: HTMLElement): [number, number, number] {
  const style = getComputedStyle(el)
  const accent = style.getPropertyValue('--accent').trim()
  if (!accent) return [0.4, 0.6, 1.0] // フォールバック

  // 一時 div で computed color を取得
  const tmp = document.createElement('div')
  tmp.style.color = accent
  tmp.style.display = 'none'
  document.body.appendChild(tmp)
  const computed = getComputedStyle(tmp).color
  document.body.removeChild(tmp)

  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) {
    return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255]
  }
  return [0.4, 0.6, 1.0]
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Cursor trail shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
  if (!vs || !fs) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Cursor trail program link error:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

// --- prefers-reduced-motion チェック ---

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// --- メインファクトリ ---

export function createCursorTrailExtension(modules: {
  EditorView: typeof import('@codemirror/view').EditorView
}): {
  extension: Extension
  cleanup: () => void
} {
  // reduced-motion の場合は空の拡張を返す
  if (prefersReducedMotion()) {
    return { extension: [], cleanup: () => {} }
  }

  const { EditorView } = modules

  let canvas: HTMLCanvasElement | null = null
  let gl: WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  let buf: WebGLBuffer | null = null
  let animFrameId: number | null = null
  let loopRunning = false
  let destroyed = false

  // uniform locations
  let uResolution: WebGLUniformLocation | null = null
  let uCurrentCursor: WebGLUniformLocation | null = null
  let uPreviousCursor: WebGLUniformLocation | null = null
  let uCursorSize: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uTimeCursorChange: WebGLUniformLocation | null = null
  let uAccentColor: WebGLUniformLocation | null = null

  // カーソル状態
  let currentCursorX = 0
  let currentCursorY = 0
  let previousCursorX = 0
  let previousCursorY = 0
  let cursorWidth = 2
  let cursorHeight = 20
  let timeCursorChange = 0
  let isFirstUpdate = true
  let cursorWasOffscreen = false
  let accentColorRGB: [number, number, number] = [0.4, 0.6, 1.0]

  // スクロール監視
  let scrollHandler: (() => void) | null = null
  let scrollView: InstanceType<typeof EditorView> | null = null

  // reduced-motion の動的変更を監視
  let motionQuery: MediaQueryList | null = null
  let motionListener: ((e: MediaQueryListEvent) => void) | null = null

  function setupCanvas(editorEl: HTMLElement) {
    const scroller = editorEl.querySelector('.cm-scroller') as HTMLElement
    if (!scroller || canvas) return

    // scroller の position を relative に（既に relative なら問題なし）
    const scrollerPosition = getComputedStyle(scroller).position
    if (scrollerPosition === 'static') {
      scroller.style.position = 'relative'
    }

    canvas = document.createElement('canvas')
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '10'
    scroller.appendChild(canvas)

    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
    if (!gl) {
      console.warn('Cursor trail: WebGL2 not available')
      canvas.remove()
      canvas = null
      return
    }

    program = createProgram(gl)
    if (!program) {
      canvas.remove()
      canvas = null
      gl = null
      return
    }

    // フルスクリーン四角形の頂点バッファ
    vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    const aPos = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    // uniform locations
    uResolution = gl.getUniformLocation(program, 'uResolution')
    uCurrentCursor = gl.getUniformLocation(program, 'uCurrentCursor')
    uPreviousCursor = gl.getUniformLocation(program, 'uPreviousCursor')
    uCursorSize = gl.getUniformLocation(program, 'uCursorSize')
    uTime = gl.getUniformLocation(program, 'uTime')
    uTimeCursorChange = gl.getUniformLocation(program, 'uTimeCursorChange')
    uAccentColor = gl.getUniformLocation(program, 'uAccentColor')

    gl.useProgram(program)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    resizeCanvas()

    // アクセントカラーを遅延取得（CSS変数の反映を待つ）
    requestAnimationFrame(() => {
      accentColorRGB = parseAccentColor(editorEl)
    })
  }

  function resizeCanvas() {
    if (!canvas || !gl) return
    const parent = canvas.parentElement
    if (!parent) return
    const rect = parent.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
  }

  function render() {
    if (!gl || !program || !canvas) return

    const now = performance.now() / 1000
    const elapsed = now - timeCursorChange

    // フェードアウト完了後はクリアしてループ停止
    if (elapsed > 0.6) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      stopLoop()
      return
    }

    const dpr = window.devicePixelRatio || 1

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)

    gl.uniform2f(uResolution, canvas.width, canvas.height)
    gl.uniform2f(uCurrentCursor, currentCursorX * dpr, currentCursorY * dpr)
    gl.uniform2f(uPreviousCursor, previousCursorX * dpr, previousCursorY * dpr)
    gl.uniform2f(uCursorSize, cursorWidth * dpr, cursorHeight * dpr)
    gl.uniform1f(uTime, now)
    gl.uniform1f(uTimeCursorChange, timeCursorChange)
    gl.uniform3f(uAccentColor, accentColorRGB[0], accentColorRGB[1], accentColorRGB[2])

    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  function stopLoop() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    loopRunning = false
  }

  function startLoop() {
    if (destroyed || loopRunning) return
    loopRunning = true
    function frame() {
      if (destroyed || !loopRunning) return
      render()
      animFrameId = requestAnimationFrame(frame)
    }
    animFrameId = requestAnimationFrame(frame)
  }

  function resetTrailToCurrent() {
    previousCursorX = currentCursorX
    previousCursorY = currentCursorY
  }

  /** カーソルの scroller 内相対座標と実際の高さを返す。ビューポート外なら null */
  function getCursorScrollerCoords(
    view: InstanceType<typeof EditorView>
  ): { x: number; y: number; charHeight: number } | null {
    const sel = view.state.selection.main
    const coords = view.coordsAtPos(sel.head)
    if (!coords) return null

    const scroller = view.scrollDOM
    if (!scroller) return null
    const scrollerRect = scroller.getBoundingClientRect()

    const charHeight = Math.max(coords.bottom - coords.top, 1)

    return {
      x: coords.left - scrollerRect.left,
      // シェーダーは座標を矩形の中心として扱うため、カーソル中心の Y 座標を返す
      y: coords.top - scrollerRect.top + charHeight / 2,
      charHeight,
    }
  }

  function updateCursorPosition(view: InstanceType<typeof EditorView>) {
    const pos = getCursorScrollerCoords(view)

    // カーソルがビューポート外: 次回復帰時にトレイルを切るためフラグを立てる
    if (!pos) {
      cursorWasOffscreen = true
      return
    }

    // カーソル形状検出
    const editorEl = view.dom
    const isBlockCursor = editorEl.classList.contains('cm-fat-cursor')
    const defaultCharWidth = view.defaultCharacterWidth

    cursorWidth = isBlockCursor ? defaultCharWidth : 2
    cursorHeight = pos.charHeight

    // 初回またはビューポート外から復帰した場合:
    // 古い座標からの不正なトレイルを防ぐため、前の位置も新しい位置にする
    if (isFirstUpdate || cursorWasOffscreen) {
      currentCursorX = pos.x
      currentCursorY = pos.y
      resetTrailToCurrent()
      isFirstUpdate = false
      cursorWasOffscreen = false
    } else {
      // 通常のカーソル移動: 前の位置を保存してから新しい位置を設定
      previousCursorX = currentCursorX
      previousCursorY = currentCursorY
      currentCursorX = pos.x
      currentCursorY = pos.y
    }

    timeCursorChange = performance.now() / 1000

    // フェードアウト完了でループが停止している場合は再開
    startLoop()
  }

  /** canvas をスクロール位置に追従させる */
  function syncCanvasToScroll(scroller: HTMLElement) {
    if (!canvas) return
    canvas.style.top = scroller.scrollTop + 'px'
    canvas.style.left = scroller.scrollLeft + 'px'
  }

  /** スクロール時: canvas を追従 + 座標を再取得して軌跡を切る（startLoop は呼ばない） */
  function onScroll(view: InstanceType<typeof EditorView>) {
    syncCanvasToScroll(view.scrollDOM)

    const pos = getCursorScrollerCoords(view)

    if (!pos) {
      // カーソルがビューポート外に出た
      cursorWasOffscreen = true
      return
    }

    // スクロール中でもカーソルがビューポート内なら座標を追従させる
    currentCursorX = pos.x
    currentCursorY = pos.y
    resetTrailToCurrent()
    cursorWasOffscreen = false
  }

  // ViewPlugin 定義
  const cursorTrailPlugin = EditorView.updateListener.of((update) => {
    // エディタ初期化時に canvas をセットアップ
    if (!canvas) {
      setupCanvas(update.view.dom)
    }

    // canvas が正常に作成された場合のみスクロール監視を登録
    if (canvas && !scrollHandler) {
      scrollView = update.view
      scrollHandler = () => onScroll(scrollView!)
      update.view.scrollDOM.addEventListener('scroll', scrollHandler, { passive: true })
    }

    // カーソル位置の変更を検知
    if (update.selectionSet || update.docChanged) {
      updateCursorPosition(update.view)
    }

    // ジオメトリ変更時にリサイズ
    if (update.geometryChanged) {
      resizeCanvas()
    }
  })

  // reduced-motion の動的変更を監視
  if (typeof window !== 'undefined') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionListener = (e) => {
      if (e.matches) {
        // reduced-motion が有効になったらクリーンアップ
        cleanupInternal()
      }
    }
    motionQuery.addEventListener('change', motionListener)
  }

  function cleanupInternal() {
    destroyed = true
    stopLoop()
    if (scrollHandler && scrollView) {
      scrollView.scrollDOM.removeEventListener('scroll', scrollHandler)
      scrollHandler = null
      scrollView = null
    }
    if (gl) {
      if (buf) {
        gl.deleteBuffer(buf)
        buf = null
      }
      if (vao) {
        gl.deleteVertexArray(vao)
        vao = null
      }
      if (program) {
        gl.deleteProgram(program)
        program = null
      }
    }
    if (canvas) {
      canvas.remove()
      canvas = null
    }
    gl = null
    if (motionQuery && motionListener) {
      motionQuery.removeEventListener('change', motionListener)
      motionQuery = null
      motionListener = null
    }
  }

  return {
    extension: cursorTrailPlugin,
    cleanup: cleanupInternal,
  }
}
