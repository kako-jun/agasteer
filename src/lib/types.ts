/**
 * 型定義
 * アプリケーション全体で使用される型を定義
 */

export type UUID = string

export type ThemeType = 'yomi' | 'campus' | 'greenboard' | 'whiteboard' | 'dotsD' | 'dotsF'

export type View = 'home' | 'settings' | 'edit' | 'note' | 'preview'

export interface Settings {
  token: string
  username: string
  email: string
  repoName: string
  theme: ThemeType
  toolName: string
  hasCustomFont?: boolean
  hasCustomBackgroundLeft?: boolean
  hasCustomBackgroundRight?: boolean
  backgroundOpacityLeft?: number
  backgroundOpacityRight?: number
}

export interface CustomFont {
  name: string
  data: ArrayBuffer
  type: string
}

export interface CustomBackground {
  name: string
  data: ArrayBuffer
  type: string
}

export interface Metadata {
  version: number
  notes: Record<string, { id: string; order: number }>
  leaves: Record<string, { id: string; updatedAt: number; order: number }>
  pushCount: number
}

export interface Note {
  id: UUID
  name: string
  parentId?: UUID
  order: number
}

export interface Leaf {
  id: UUID
  title: string
  noteId: UUID
  content: string
  updatedAt: number
  order: number
}

export interface Breadcrumb {
  label: string
  action: () => void
  id: UUID
  type: 'home' | 'note' | 'leaf' | 'settings'
}

export type ModalType = 'confirm' | 'alert'

export interface ModalState {
  show: boolean
  message: string
  type: ModalType
  callback: (() => void) | null
}
