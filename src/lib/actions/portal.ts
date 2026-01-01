/**
 * Portal用のSvelte action
 * 要素をdocument.bodyに移動させ、モーダルやドロップダウンなどのオーバーレイに使用
 */

/**
 * 要素をdocument.bodyに移動させるSvelte action
 * 使用例:
 * <div use:portal>ポータルコンテンツ</div>
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}
