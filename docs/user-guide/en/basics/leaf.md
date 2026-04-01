# Leaf Operations

How to create, edit, move, and delete leaves where you actually write memos.

---

## Create

1. Inside a note, tap the "**+file**" button
2. Enter a leaf name and tap "Create"

---

## Edit

Tap a leaf to open the editor. You can write in Markdown format.

### Auto-Save

Edits are automatically saved to the browser (IndexedDB).

#### How It Works

- **Debounced save**: Auto-saves **1 second** after the last keystroke
- Won't save while you're continuously typing; saves when you pause
- Display updates immediately (reflects changes without waiting for save to complete)

#### Save Before Push

When you Push to GitHub (save button, Ctrl+S, or `:w`), any pending auto-saves are **immediately executed** before the Push.

- Even if you Push right after typing, the latest content is guaranteed to be saved
- You can Push without worrying about timing

---

## Title and Heading Sync

If the first line of a leaf is `# Heading`, it automatically syncs with the leaf title.

```markdown
# Today's Diary

It was a nice day today.
```

In this case, the leaf title becomes "Today's Diary". Conversely, if you change the title, the first line heading is also updated.

---

## Reorder

**Drag and drop** leaf cards to reorder them.

---

## Move

You can move leaves to another note.

1. Open the leaf
2. Tap the "Move" button in the footer
3. Select the destination note
4. Tap "Move"

Notes can be moved the same way.

---

## Delete

1. Open the leaf
2. Tap the trash button in the footer
3. Tap "OK" in the confirmation dialog

---

## Text Recognition (OCR)

You can extract text from images and insert it into a leaf.

1. Open a leaf (edit mode)
2. Tap the camera button in the center of the footer
3. Choose "Take Photo" or "Choose File"
4. Review the image and tap "Recognize"
5. The extracted text is inserted at the cursor position

> **Tip**: Processing runs entirely in the browser. Your images are never sent to external servers. If the result isn't what you expected, use Ctrl+Z (Cmd+Z) to undo.

---

## Download

You can download individual leaves locally.

1. Open the leaf
2. Tap the download button in the footer
3. Downloads as a `.md` file

> **Tip**: If you have text selected when downloading, only the selected portion will be downloaded.
