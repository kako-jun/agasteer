# Archive

Store notes/leaves you no longer use in a separate location. Not deleted, so you can always restore them.

---

## Two Worlds

Agasteer has two independent spaces.

| World       | Purpose                    | Pull                  |
| ----------- | -------------------------- | --------------------- |
| **Home**    | Notes/leaves for daily use | Auto-Pull on startup  |
| **Archive** | Things no longer in use    | Pull only when opened |

> **Tip**: Archive is completely separate from Home, keeping Home lightweight.

---

## How to Switch Worlds

1. Tap "**›**" on the left end of the breadcrumb (`Home > ...`)
2. A dropdown appears
3. Select **Home** or **Archive**

### First Access

- Selecting Archive **switches to the archive screen immediately**
- Data is Pulled from GitHub in the background
- The statistics display (leaf count, character count) in the bottom-right increases in real-time, showing progress
- From the second time, it's cached and displays instantly

### Quick Return to Home

Tap the title "Agasteer" in the top-left header → Returns to Home top from anywhere

### Independent Per Pane

In two-pane display, **each pane can show a different world**.

- Left: Home, Right: Archive
- Switch independently via each pane's breadcrumb
- Reference archived leaves while writing in Home

---

## How to Archive

1. Open the note or leaf you want to archive
2. Tap the "**Archive**" button in the footer
3. Tap "OK" in the confirmation dialog

### Behavior After Archiving

- Moved to the Archive world
- **Hierarchy structure is preserved**
  - Example: `NoteA/SubNoteB/LeafC` → Same hierarchy in Archive
- Archiving a note → Sub-notes and leaves inside move together
- Auto-navigates to parent note after operation

### When Same Name Exists

If a note/leaf with the same name exists in Archive, a **confirmation dialog appears before the operation**.

**Options**:

| Option     | Behavior                                                                        |
| ---------- | ------------------------------------------------------------------------------- |
| **Cancel** | Abort the operation                                                             |
| **Skip**   | Keep existing, don't move                                                       |
| **Add**    | Note: Add leaves to existing note<br>Leaf: Auto-rename and add (e.g., `Task_2`) |

> **Tip**: The choice applies to the entire operation. No need to choose individually.

---

## How to Restore

1. Switch to the **Archive** world
2. Open the note or leaf you want to restore
3. Tap the "**Restore**" button in the footer
4. Tap "OK" in the confirmation dialog

### Behavior After Restoring

- Returned to the Home world
- Hierarchy structure is preserved
- If same name exists in Home, a confirmation dialog lets you choose how to handle it
