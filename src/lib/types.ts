/**
 * 型定義
 * アプリケーション全体で使用される型を定義
 */

export type UUID = string

export type ThemeType = 'light' | 'dark' | 'blackboard' | 'kawaii' | 'custom'

export type View = 'home' | 'settings' | 'edit' | 'folder'

export interface Settings {
  token: string
  username: string
  email: string
  repoName: string
  theme: ThemeType
  customBgPrimary: string
  customAccentColor: string
}

export interface Folder {
  id: UUID
  name: string
  parentId?: UUID
  order: number
}

export interface Note {
  id: UUID
  title: string
  folderId: UUID
  content: string
  updatedAt: number
  order: number
}

export interface Breadcrumb {
  label: string
  action: () => void
  id: UUID
  type: 'home' | 'folder' | 'note' | 'settings'
}

export type ModalType = 'confirm' | 'alert'

export interface ModalState {
  show: boolean
  message: string
  type: ModalType
  callback: (() => void) | null
}
