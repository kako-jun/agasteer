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

| Format            | File Type                     |
| ----------------- | ----------------------------- |
| Agasteer format   | Exported file                 |
| SimpleNote format | .json (or .zip containing it) |

### Behavior After Import

- A new note is created with leaves placed inside
- Result summary is displayed
- Unsupported elements (attachments, etc.) are skipped

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
