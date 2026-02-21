# GitHub Sync

How to save to GitHub (Push) and retrieve from GitHub (Pull).

---

## Saving to GitHub (Push)

If you've set up GitHub integration, you can save your edits to GitHub.

### How to Save

- Tap the "💾" button in the footer
- Or press **Ctrl+S** (Mac: **Cmd+S**)

### Unsaved Changes

When there are unsaved changes, a **red dot** appears on the save button.

### Stale Warning

If edits were made on another device, a warning appears before Push. You can choose to overwrite or Pull first.

### Auto Push

After editing, if you're idle for **42 seconds**, changes are automatically pushed to GitHub.

- Saves you the trouble of manual saving
- Won't auto-push while you're active (typing, clicking, scrolling, etc.)
- A progress bar below the save button shows time until the next auto-push

> **Tip**: If you need to save urgently, press the save button manually or use Ctrl+S.

---

## Retrieving from GitHub (Pull)

Sync the latest data from GitHub to your browser.

### How to Pull

- Tap the "⬇️" button on the left side of the header
- In the PWA version, there's no reload button, so use this button to Pull

### Auto Pull

Pull is automatically executed when the app starts.

### Background Check

Remote changes are automatically checked every 5 minutes. If there are new changes:

- **If no unsaved changes** → Pull is automatically executed
- **If unsaved changes exist** → A red dot appears on the Pull button (please Pull manually)

> **Tip**: If you've been idle for 5 minutes and have no unsaved changes, changes from other devices are automatically synced.

---

## Data Protection Features

### Page Exit Confirmation

If you try to close the tab or reload while there are unsaved changes, a browser confirmation dialog appears.

- Prevents accidentally losing changes
- Does not appear during in-app navigation (due to auto-save)

### Stale Progress Bar

A thin vertical line (progress bar) is displayed on the left edge of the header.

- Automatically checks for remote changes **every 5 minutes**
- Bar extends from top to bottom; check runs when full
- If changes were made on another device, a red dot appears on the Pull button

> **Tip**: Manual Pull/Push resets the countdown to the next check.

### Read-Only Mode During Pull

During Pull, a semi-transparent overlay (glass effect) covers the editing area, preventing edits.

- To maintain data consistency
- Offline leaves are an exception (editable even during Pull)
- **Switching to Archive is also blocked during Pull** (to prevent data inconsistency)

---

## Statistics

Statistics are displayed in the bottom-right of the home screen.

| Item           | Description                    |
| -------------- | ------------------------------ |
| **Leaf count** | Total number of created leaves |
| **Characters** | Total characters across leaves |
| **Push count** | Number of Pushes to GitHub     |
