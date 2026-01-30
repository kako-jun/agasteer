# Priority Leaf

A feature that aggregates prioritized paragraphs scattered across multiple leaves into one display.

---

## Marking Priority Paragraphs

Add `[n]` markers (n is a number) to paragraphs.

```markdown
[1] Highest priority task

This is a normal paragraph.

Important work [2]

[3] Complete within this week
```

### Rules

| Position              | Pattern                  | Quote Range          |
| --------------------- | ------------------------ | -------------------- |
| First line start      | `[n] text...`            | **Entire paragraph** |
| Last line end         | `...text [n]`            | **Entire paragraph** |
| First line end        | `...text [n]`            | That line only       |
| Last line start       | `[n] text...`            | That line only       |
| Middle line start/end | `[n] text` or `text [n]` | That line only       |

> **Note**: Spaces are required to distinguish from `text[1]` (citation numbers) or `array[0]` (arrays).

### Example

```markdown
[1] This entire paragraph is quoted
Even if it spans
multiple lines

This line is not included
[2] Only this line is quoted
This line is also not included

This paragraph is
entirely quoted [3]
```

- `[1]` → Entire paragraph (3 lines)
- `[2]` → Middle line only
- `[3]` → Entire paragraph (2 lines)

> **Note**: When an entire paragraph is quoted, markers in middle lines are removed.

---

## Priority Leaf Display

A "Priority" leaf appears at the top of the home screen.

- Sorted by priority (numbers ascending)
- Same priority: sorted by note order, then leaf order
- Opens in preview mode when clicked (read-only)
- Click the "ⓘ" icon next to the card name to open this help page

---

## Source Display

The original leaf name and note name are displayed below each paragraph.

```
**[1]** Highest priority task
_— Task Management @ Work Note_
```

---

## Specifications

- **Virtual leaf**: Not saved to GitHub
- **Real-time updates**: Auto-reflects when markers are added/removed
- **Excluded from stats**: Character/line counts not included in home statistics
