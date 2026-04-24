# Import/Export

Back up your data or migrate from other apps.

---

## Export

Download all notes and leaves as a ZIP file.

### Steps

1. Open settings
2. Tap the "**Export**" button
3. `agasteer-export-YYYY-MM-DD.zip` is downloaded

### ZIP Contents

```
agasteer-export-YYYY-MM-DD/
├── notes/
│   ├── Note1/
│   │   ├── Leaf1.md
│   │   └── SubNote/
│   │       └── Leaf2.md
│   └── Note2/
│       └── Leaf3.md
└── metadata.json  # Sort order, badge info, etc.
```

### Notes

- Git history (.git/) is not included
- Export available after initial Pull is complete

> **Tip**: Regular exports give peace of mind in case of emergencies.

---

## Import

Import export files.

### Steps

1. Open settings
2. Tap "**Import**"
3. Select a file

### Supported Formats

| Format                    | File Type                                                |
| ------------------------- | -------------------------------------------------------- |
| Agasteer format           | Exported file                                            |
| SimpleNote format         | .json (or .zip containing it)                            |
| Google Keep format        | Google Takeout .zip, or individual .json after unzipping |
| Cosense (Scrapbox) format | Project export .json                                     |

### Behavior After Import

- A note named after the source (`SimpleNote_1` / `GoogleKeep_1` / `Cosense_1`) is created with leaves placed flat inside
- An "Import Summary" report leaf is generated as the first leaf (records what was imported and what was skipped)
- Unsupported elements are skipped and recorded in the report

### Google Keep Notes

- Checklists converted to `- [ ]` / `- [x]`
- Links (annotations) appended at end of content
- Image attachments, colors, labels, pinned state are not supported (recorded in report)
- HTML files and image files are not used (JSON only)
- Notes with `isTrashed: true` are skipped

### Cosense (Scrapbox) Notes

Cosense does not offer a ZIP export, so select the project's `.json` export directly.

**Notation conversion**:

- `[URL label]` / `[label URL]` → `[label](URL)` Markdown link
- `[image URL]` (.png / .jpg / .jpeg / .gif / .webp / .svg) → `![](URL)` Markdown image
- `[URL]` (non-image, standalone) → `<URL>` autolink
- `[page name]` (no URL) → kept as `[page name]` (no resolution target)
- `#tag` → kept as plain text
- Leading whitespace / tabs → preserved so outline structure is not lost

**Not imported (recorded in report)**:

- External images (URLs are preserved; host availability is not guaranteed)
- Page thumbnails (`page.image`)
- Page view counts
- Per-line editor attribution and timestamps
- Hashtag `#tag` internal link resolution
- `[page name]` internal page link resolution

### When Same Name Exists

If names conflict with existing notes/leaves, a **confirmation dialog appears before import**.

**Options**:

| Option     | Behavior                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| **Cancel** | Abort the import                                                                |
| **Skip**   | Keep existing, don't import                                                     |
| **Add**    | Note: Add leaves to existing note<br>Leaf: Auto-rename and add (e.g., `Memo_2`) |

> **Tip**: If you import the same file twice, choose "Skip" to avoid duplicates.

### Notes

- Import available after initial Pull is complete
- Recommended to Push after import to save
