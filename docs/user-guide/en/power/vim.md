# Vim Mode

Use CodeMirror's Vim key bindings.

---

## Enable

1. Open settings
2. Turn ON "Enable Vim mode" in the "Editor" section

---

## Basic Operations

### Normal Mode

| Key                   | Action                     |
| --------------------- | -------------------------- |
| `i` / `a` / `o`       | Enter insert mode          |
| `h` / `j` / `k` / `l` | Cursor movement            |
| `dd`                  | Delete line                |
| `yy`                  | Copy line                  |
| `p`                   | Paste                      |
| `u`                   | Undo                       |
| `Ctrl-r`              | Redo                       |
| `<Space>`             | Switch panes (in two-pane) |

### Agasteer-Specific Commands

| Command | Action                          |
| ------- | ------------------------------- |
| `:w`    | Push to GitHub (save)           |
| `:q`    | Navigate to parent note (close) |
| `:wq`   | Save and close                  |

---

## Two-Pane Behavior

- Vim mode operates independently in left and right panes
- Use `<Space>` to switch between left and right panes
- Commands can be executed independently in each pane
