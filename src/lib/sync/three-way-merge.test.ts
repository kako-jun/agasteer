import { describe, expect, it } from 'vitest'
import type { Leaf, Note } from '../types'
import {
  matchLines,
  mergeLines,
  mergeText,
  mergeWorld,
  sameWorldContent,
  type WorldSnapshot,
} from './three-way-merge'

function note(id: string, name: string, extra: Partial<Note> = {}): Note {
  return { id, name, order: 0, ...extra }
}

function leaf(
  id: string,
  noteId: string,
  title: string,
  content: string,
  extra: Partial<Leaf> = {}
): Leaf {
  return { id, noteId, title, content, updatedAt: 1, order: 0, ...extra }
}

const lines = (...xs: string[]) => xs.join('\n')

describe('matchLines (Myers)', () => {
  it('一致行を単調増加の対応として返す', () => {
    const a = ['a', 'b', 'c', 'd', 'e']
    const b = ['a', 'x', 'c', 'e', 'y']
    const m = Array.from(matchLines(a, b))
    expect(m).toEqual([0, -1, 2, -1, 3])
  })

  it('完全一致・空配列', () => {
    expect(Array.from(matchLines(['a', 'b'], ['a', 'b']))).toEqual([0, 1])
    expect(Array.from(matchLines([], ['a']))).toEqual([])
    expect(Array.from(matchLines(['a'], []))).toEqual([-1])
  })

  it('最長の共通部分を見つける（先頭・末尾が違っても中間を対応づける）', () => {
    const a = ['x', 'a', 'b', 'c', 'y']
    const b = ['p', 'a', 'b', 'c', 'q']
    expect(Array.from(matchLines(a, b))).toEqual([-1, 1, 2, 3, -1])
  })
})

describe('mergeText (diff3)', () => {
  const base = lines('1', '2', '3', '4', '5', '6', '7')

  it('離れた行の編集は両方を残す', () => {
    const local = lines('1', 'L2', '3', '4', '5', '6', '7')
    const remote = lines('1', '2', '3', '4', '5', 'R6', '7')
    expect(mergeText(base, local, remote)).toEqual({
      merged: lines('1', 'L2', '3', '4', '5', 'R6', '7'),
      conflicts: [],
    })
  })

  it('片側の追加と他方の離れた削除を両方残す', () => {
    const local = lines('0', '1', '2', '3', '4', '5', '6', '7')
    const remote = lines('1', '2', '3', '4', '5', '7')
    expect(mergeText(base, local, remote).merged).toBe(lines('0', '1', '2', '3', '4', '5', '7'))
  })

  it('双方が同じ変更をしたら1つにまとめる', () => {
    const both = lines('1', '2', 'X', '4', '5', '6', '7')
    expect(mergeText(base, both, both)).toEqual({ merged: both, conflicts: [] })
    const local = lines('1', '2', 'X', '4', '5', '6', 'L7')
    const remote = lines('1', '2', 'X', '4', '5', '6', '7')
    expect(mergeText(base, local, remote).merged).toBe(local)
  })

  it('同じ行の相反する編集は競合（該当行と双方の内容を返す）', () => {
    const local = lines('1', '2', 'L3', '4', '5', '6', '7')
    const remote = lines('1', '2', 'R3', '4', '5', '6', '7')
    const result = mergeText(base, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts).toEqual([
      { baseStart: 2, baseEnd: 3, base: ['3'], local: ['L3'], remote: ['R3'] },
    ])
  })

  it('隣接行の編集も安全側で競合にする', () => {
    const local = lines('1', 'L2', '3', '4', '5', '6', '7')
    const remote = lines('1', '2', 'R3', '4', '5', '6', '7')
    expect(mergeText(base, local, remote).merged).toBeNull()
  })

  it('同じ位置への別々の挿入は競合（挿入位置を返す）', () => {
    const local = lines('1', '2', 'L', '3', '4', '5', '6', '7')
    const remote = lines('1', '2', 'R', '3', '4', '5', '6', '7')
    const result = mergeText(base, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts[0]).toMatchObject({
      baseStart: 2,
      baseEnd: 2,
      local: ['L'],
      remote: ['R'],
    })
  })

  it('行の削除と同じ行の編集は競合', () => {
    const local = lines('1', '2', '4', '5', '6', '7')
    const remote = lines('1', '2', 'R3', '4', '5', '6', '7')
    const result = mergeText(base, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts[0]).toMatchObject({ local: [], remote: ['R3'] })
  })

  it('末尾改行の有無を保つ', () => {
    expect(mergeText('a\nb\n', 'A\nb\n', 'a\nb\nc\n').merged).toBe('A\nb\nc\n')
  })

  it('片側だけの変更・どちらも未変更', () => {
    expect(mergeText('a', 'a', 'b').merged).toBe('b')
    expect(mergeText('a', 'b', 'a').merged).toBe('b')
    expect(mergeText('a', 'a', 'a').merged).toBe('a')
  })

  it('大きな書き換えでも結果は安全側（競合）に倒れ、例外にならない', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`)
    const local = big.map((l) => `${l} local`)
    const remote = big.map((l) => `${l} remote`)
    const result = mergeLines(big, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts.length).toBeGreaterThan(0)
  })

  it('大きなファイルの離れた編集はマージできる', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    const local = [...big]
    local[10] = 'local edit'
    const remote = [...big]
    remote[4000] = 'remote edit'
    const result = mergeLines(big, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.merged?.[10]).toBe('local edit')
    expect(result.merged?.[4000]).toBe('remote edit')
    expect(result.merged?.length).toBe(5000)
  })
})

describe('mergeWorld', () => {
  const base: WorldSnapshot = {
    notes: [note('n1', 'Work'), note('n2', 'Home', { order: 1 })],
    leaves: [
      leaf('a', 'n1', 'Todo', lines('one', 'two', 'three', 'four', 'five')),
      leaf('b', 'n1', 'Memo', 'memo'),
      leaf('c', 'n2', 'Shop', 'milk'),
    ],
  }
  const clone = (w: WorldSnapshot): WorldSnapshot => JSON.parse(JSON.stringify(w))

  it('追加・削除を含む複数ファイルの変更と、同一ファイルの離れた編集を両方残す', () => {
    const local = clone(base)
    local.leaves[0].content = lines('ONE', 'two', 'three', 'four', 'five')
    local.leaves.push(leaf('d', 'n2', 'New local', 'L'))
    local.leaves = local.leaves.filter((l) => l.id !== 'c') // ローカルで Shop を削除

    const remote = clone(base)
    remote.leaves[0].content = lines('one', 'two', 'three', 'four', 'FIVE')
    remote.leaves[1].content = 'memo edited'
    remote.notes.push(note('n3', 'Ideas', { order: 2 }))
    remote.leaves.push(leaf('e', 'n3', 'New remote', 'R'))

    const result = mergeWorld(base, local, remote)
    expect(result.conflicts).toEqual([])
    const merged = result.merged!
    const byId = new Map(merged.leaves.map((l) => [l.id, l]))
    expect(byId.get('a')?.content).toBe(lines('ONE', 'two', 'three', 'four', 'FIVE'))
    expect(byId.get('b')?.content).toBe('memo edited')
    expect(byId.has('c')).toBe(false)
    expect(byId.get('d')?.content).toBe('L')
    expect(byId.get('e')?.content).toBe('R')
    expect(merged.notes.map((n) => n.id).sort()).toEqual(['n1', 'n2', 'n3'])
    expect(result.localChangeCount).toBe(3)
    expect(result.remoteChangeCount).toBe(4)
  })

  it('同じ行の相反編集は競合（対象のパス・行を返し、マージ結果は出さない）', () => {
    const local = clone(base)
    local.leaves[0].content = lines('one', 'LOCAL', 'three', 'four', 'five')
    const remote = clone(base)
    remote.leaves[0].content = lines('one', 'REMOTE', 'three', 'four', 'five')
    const result = mergeWorld(base, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'content',
      target: 'leaf',
      path: 'Work/Todo',
    })
    expect(result.conflicts[0].lines?.[0]).toMatchObject({
      baseStart: 1,
      baseEnd: 2,
      local: ['LOCAL'],
      remote: ['REMOTE'],
    })
  })

  it('片側削除＋他方編集は競合（どちらが削除したかを返す）', () => {
    const local = clone(base)
    local.leaves = local.leaves.filter((l) => l.id !== 'b')
    const remote = clone(base)
    remote.leaves[1].content = 'memo edited'
    expect(mergeWorld(base, local, remote).conflicts).toEqual([
      { kind: 'deleteEdit', target: 'leaf', path: 'Work/Memo', deletedBy: 'local' },
    ])
    expect(mergeWorld(base, remote, local).conflicts).toEqual([
      { kind: 'deleteEdit', target: 'leaf', path: 'Work/Memo', deletedBy: 'remote' },
    ])
  })

  it('片側の削除だけなら削除を採る', () => {
    const local = clone(base)
    local.leaves = local.leaves.filter((l) => l.id !== 'b')
    const result = mergeWorld(base, local, clone(base))
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves.some((l) => l.id === 'b')).toBe(false)
  })

  it('名前の相反変更は競合、片側だけの改名は採る', () => {
    const local = clone(base)
    local.leaves[2].title = 'Groceries'
    const remote = clone(base)
    remote.leaves[2].title = 'Market'
    expect(mergeWorld(base, local, remote).conflicts[0]).toMatchObject({
      kind: 'attribute',
      field: 'name',
      localValue: 'Groceries',
      remoteValue: 'Market',
    })
    const onlyLocal = mergeWorld(base, local, clone(base))
    expect(onlyLocal.merged!.leaves.find((l) => l.id === 'c')?.title).toBe('Groceries')
  })

  it('マージ後に同じ場所へ同じ名前ができるなら競合', () => {
    const local = clone(base)
    local.leaves.push(leaf('x', 'n1', 'Same', 'L'))
    const remote = clone(base)
    remote.leaves.push(leaf('y', 'n1', 'Same', 'R'))
    expect(mergeWorld(base, local, remote).conflicts).toEqual([
      { kind: 'pathCollision', target: 'leaf', path: 'Work/Same' },
    ])
  })

  it('リモートで削除されたノートにローカルで追加したら競合', () => {
    const local = clone(base)
    local.leaves.push(leaf('x', 'n2', 'Added', 'L'))
    const remote = clone(base)
    remote.notes = remote.notes.filter((n) => n.id !== 'n2')
    remote.leaves = remote.leaves.filter((l) => l.noteId !== 'n2')
    const result = mergeWorld(base, local, remote)
    expect(result.merged).toBeNull()
    expect(result.conflicts).toEqual([{ kind: 'structure', target: 'leaf', path: 'Home/Added' }])
  })

  it('並び順だけの食い違いは競合にせずリモートを採る', () => {
    const local = clone(base)
    local.leaves[0].order = 5
    const remote = clone(base)
    remote.leaves[0].order = 9
    const result = mergeWorld(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves.find((l) => l.id === 'a')?.order).toBe(9)
  })

  it('本文がリモートと同じときだけ blobSha を引き継ぐ', () => {
    const local = clone(base)
    local.leaves[0].content = lines('ONE', 'two', 'three', 'four', 'five')
    const remote = clone(base)
    remote.leaves.forEach((l) => (l.blobSha = `sha-${l.id}`))
    const merged = mergeWorld(base, local, remote).merged!
    expect(merged.leaves.find((l) => l.id === 'a')?.blobSha).toBeUndefined()
    expect(merged.leaves.find((l) => l.id === 'b')?.blobSha).toBe('sha-b')
  })

  it('双方で同じものを削除しても競合にしない', () => {
    const local = clone(base)
    local.leaves = local.leaves.filter((l) => l.id !== 'c')
    const remote = clone(local)
    const result = mergeWorld(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves.map((l) => l.id).sort()).toEqual(['a', 'b'])
  })
})

describe('matchLines / mergeLines の性質（固定シードの乱数）', () => {
  // 小さな線形合同法（再現性のため Math.random を使わない）
  let seed = 321
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const randomLines = () => Array.from({ length: rand(12) }, () => 'abcd'[rand(4)])
  const lcsLength = (a: string[], b: string[]) => {
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] =
          a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    return dp[a.length][b.length]
  }

  it('一致は有効な共通部分列で、長さは最長共通部分列と等しい', () => {
    for (let t = 0; t < 300; t++) {
      const a = randomLines()
      const b = randomLines()
      const m = Array.from(matchLines(a, b))
      let last = -1
      let count = 0
      m.forEach((j, i) => {
        if (j < 0) return
        expect(j).toBeGreaterThan(last)
        expect(a[i]).toBe(b[j])
        last = j
        count++
      })
      expect(count).toBe(lcsLength(a, b))
    }
  })

  it('片側だけが変わったときは、その側がそのまま結果になる', () => {
    for (let t = 0; t < 300; t++) {
      const base = randomLines()
      const other = randomLines()
      expect(mergeLines(base, other, base).merged).toEqual(other)
      expect(mergeLines(base, base, other).merged).toEqual(other)
      expect(mergeLines(base, other, other).merged).toEqual(other)
    }
  })
})

describe('mergeWorld: Push の実パスでの同名衝突 (M1)', () => {
  const base: WorldSnapshot = { notes: [note('n1', 'Work')], leaves: [] }
  const clone = (w: WorldSnapshot): WorldSnapshot => JSON.parse(JSON.stringify(w))
  const bothAdd = (localTitle: string, remoteTitle: string) => {
    const local = clone(base)
    local.leaves.push(leaf('x', 'n1', localTitle, 'L'))
    const remote = clone(base)
    remote.leaves.push(leaf('y', 'n1', remoteTitle, 'R'))
    return mergeWorld(base, local, remote)
  }

  it('「TODO: x」と「TODO- x」は Push で同じファイル名になるので競合', () => {
    const result = bothAdd('TODO: x', 'TODO- x')
    expect(result.merged).toBeNull()
    expect(result.conflicts).toEqual([
      { kind: 'pathCollision', target: 'leaf', path: 'Work/TODO- x' },
    ])
  })

  it('80文字を超えて先頭80文字が同じ名前は競合', () => {
    const head = 'a'.repeat(80)
    expect(bothAdd(`${head}-local`, `${head}-remote`).conflicts[0]).toMatchObject({
      kind: 'pathCollision',
    })
  })

  it('空白の数だけが違う名前は競合', () => {
    expect(bothAdd('a  b', 'a b').conflicts[0]).toMatchObject({ kind: 'pathCollision' })
  })

  it('サニタイズ後も違う名前なら両方残す', () => {
    const result = bothAdd('TODO x', 'TODO y')
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves).toHaveLength(2)
  })
})

describe('mergeWorld: 件数・sameWorldContent', () => {
  it('並び順だけの変更も件数に数える（0件表示にしない）', () => {
    const base: WorldSnapshot = { notes: [note('n1', 'Work')], leaves: [leaf('a', 'n1', 'A', 'x')] }
    const local: WorldSnapshot = JSON.parse(JSON.stringify(base))
    local.leaves[0].order = 3
    const result = mergeWorld(base, local, base)
    expect(result.localChangeCount).toBe(1)
    expect(result.remoteChangeCount).toBe(0)
  })

  it('sameWorldContent は並び・updatedAt・blobSha の違いを無視し、内容の違いを検出する', () => {
    const a: WorldSnapshot = {
      notes: [note('n1', 'Work'), note('n2', 'Home')],
      leaves: [leaf('a', 'n1', 'A', 'x'), leaf('b', 'n2', 'B', 'y')],
    }
    const b: WorldSnapshot = {
      notes: [a.notes[1], a.notes[0]],
      leaves: [{ ...a.leaves[1], updatedAt: 99, blobSha: 's' }, a.leaves[0]],
    }
    expect(sameWorldContent(a, b)).toBe(true)
    expect(sameWorldContent(a, { ...b, leaves: [a.leaves[0]] })).toBe(false)
    expect(
      sameWorldContent(a, { ...b, leaves: [{ ...a.leaves[0], content: 'z' }, a.leaves[1]] })
    ).toBe(false)
  })
})

describe('mergeWorld: tree から読んだ名前（サニタイズ済み）とローカルの元の名前 (should-1)', () => {
  // base / リモートはファイル名から読むので「a-b」、ローカルは元の「a/b」のまま
  const base: WorldSnapshot = { notes: [note('n1', 'Work')], leaves: [leaf('a', 'n1', 'a-b', 'x')] }
  const local: WorldSnapshot = {
    notes: [note('n1', 'Work')],
    leaves: [leaf('a', 'n1', 'a/b', 'x')],
  }

  it('リモートの改名は偽の改名競合にならずに取り込む', () => {
    const remote: WorldSnapshot = JSON.parse(JSON.stringify(base))
    remote.leaves[0].title = 'renamed'
    const result = mergeWorld(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves[0].title).toBe('renamed')
    expect(result.localChangeCount).toBe(0)
  })

  it('リモートの削除は「削除と編集」の競合にならずに削除を採る', () => {
    const remote: WorldSnapshot = { notes: [note('n1', 'Work')], leaves: [] }
    const result = mergeWorld(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.merged!.leaves).toEqual([])
  })

  it('どちらも改名していなければローカルの元の表記を残す', () => {
    const result = mergeWorld(base, local, base)
    expect(result.merged!.leaves[0].title).toBe('a/b')
  })

  it('sameWorldContent も正規化して比べる（11/25 memo・90文字・空白2つ）', () => {
    const raw: WorldSnapshot = {
      notes: [note('n1', 'Work')],
      leaves: [
        leaf('p', 'n1', '11/25 memo', 'p'),
        leaf('q', 'n1', 'y'.repeat(90), 'q'),
        leaf('r', 'n1', 'a  b', 'r'),
      ],
    }
    const readBack: WorldSnapshot = {
      notes: [note('n1', 'Work')],
      leaves: [
        leaf('p', 'n1', '11-25 memo', 'p'),
        leaf('q', 'n1', 'y'.repeat(80), 'q'),
        leaf('r', 'n1', 'a b', 'r'),
      ],
    }
    expect(sameWorldContent(raw, readBack)).toBe(true)
  })
})
