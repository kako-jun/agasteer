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

// 平行四辺形 SDF（前カーソル→現カーソルの軌跡）
float sdParallelogram(vec2 p, vec2 a, vec2 b, float halfWidth, float halfHeight) {
  vec2 ab = b - a;
  float abLen = length(ab);
  if (abLen < 0.001) {
    // 移動していない場合は矩形 SDF
    vec2 d = abs(p - a) - vec2(halfWidth, halfHeight);
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  vec2 abDir = ab / abLen;
  // ab方向への射影
  float proj = dot(p - a, abDir);
  float t = clamp(proj / abLen, 0.0, 1.0);
  vec2 closest = a + ab * t;
  vec2 diff = p - closest;
  // 幅方向はab直交方向、高さ方向は垂直
  vec2 perp = vec2(-abDir.y, abDir.x);
  float dx = abs(dot(diff, perp)) - halfWidth;
  float dy = abs(diff.y - dot(diff, vec2(0.0, 1.0)) * 0.0) - halfHeight;
  // 簡易: 最寄り点からの距離 - サイズ
  vec2 d2 = abs(p - closest) - vec2(halfWidth, halfHeight);
  return length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0);
}

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

  float dist;
  if (abLen < 0.5) {
    // ほぼ移動していない: カーソル矩形のSDF
    vec2 d = abs(fragCoord - uCurrentCursor) - vec2(halfW, halfH);
    dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  } else {
    // 軌跡に沿ったSDF
    vec2 abDir = ab / abLen;
    float proj = dot(fragCoord - uPreviousCursor, abDir);
    float s = clamp(proj / abLen, 0.0, 1.0);
    vec2 closest = uPreviousCursor + ab * s;
    vec2 d = abs(fragCoord - closest) - vec2(halfW, halfH);
    dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // smoothstep でアンチエイリアシング（2px幅）
  float alpha = 1.0 - smoothstep(0.0, 2.0, dist);

  // カーソルからの距離ベースの追加減衰（現カーソルに近いほど濃い）
  if (abLen > 0.5) {
    vec2 abDir = ab / abLen;
    float proj = dot(fragCoord - uPreviousCursor, abDir);
    float s = clamp(proj / abLen, 0.0, 1.0);
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

export function createCursorTrailExtension(
  modules: {
    EditorView: typeof import('@codemirror/view').EditorView
  },
  isMobile: boolean
): {
  extension: Extension
  cleanup: () => void
} {
  // モバイルまたは reduced-motion の場合は空の拡張を返す
  if (isMobile || prefersReducedMotion()) {
    return { extension: [], cleanup: () => {} }
  }

  const { EditorView } = modules

  let canvas: HTMLCanvasElement | null = null
  let gl: WebGL2RenderingContext | null = null
  let program: WebGLProgram | null = null
  let animFrameId: number | null = null
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
  let accentColorRGB: [number, number, number] = [0.4, 0.6, 1.0]

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
    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
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

    // アクセントカラーを取得
    accentColorRGB = parseAccentColor(editorEl)

    resizeCanvas()
    startLoop()
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

    resizeCanvas()

    const now = performance.now() / 1000
    const elapsed = now - timeCursorChange

    // フェードアウト完了後は描画スキップ（クリアのみ）
    if (elapsed > 0.6) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
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

  function startLoop() {
    if (destroyed) return
    function frame() {
      if (destroyed) return
      render()
      animFrameId = requestAnimationFrame(frame)
    }
    animFrameId = requestAnimationFrame(frame)
  }

  function updateCursorPosition(view: InstanceType<typeof EditorView>) {
    const sel = view.state.selection.main
    const coords = view.coordsAtPos(sel.head)
    if (!coords) return

    const scroller = view.scrollDOM
    if (!scroller) return
    const scrollerRect = scroller.getBoundingClientRect()

    // スクロール位置を考慮した相対座標
    const x = coords.left - scrollerRect.left
    const y = coords.top - scrollerRect.top

    // カーソル形状検出
    const editorEl = view.dom
    const isBlockCursor = editorEl.classList.contains('cm-fat-cursor')
    const defaultLineHeight = view.defaultLineHeight
    const defaultCharWidth = view.defaultCharacterWidth

    cursorWidth = isBlockCursor ? defaultCharWidth : 2
    cursorHeight = defaultLineHeight

    // 前の位置を保存
    previousCursorX = currentCursorX
    previousCursorY = currentCursorY

    // 新しい位置を設定
    currentCursorX = x
    currentCursorY = y

    // 初回は前の位置も同じにする（トレイルが画面端から出ないように）
    if (previousCursorX === 0 && previousCursorY === 0) {
      previousCursorX = currentCursorX
      previousCursorY = currentCursorY
    }

    timeCursorChange = performance.now() / 1000

    // テーマ変更に追従するためアクセントカラーを再取得
    accentColorRGB = parseAccentColor(editorEl)
  }

  // ViewPlugin 定義
  const cursorTrailPlugin = EditorView.updateListener.of((update) => {
    // エディタ初期化時に canvas をセットアップ
    if (!canvas) {
      setupCanvas(update.view.dom)
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
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    if (canvas) {
      canvas.remove()
      canvas = null
    }
    gl = null
    program = null
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
