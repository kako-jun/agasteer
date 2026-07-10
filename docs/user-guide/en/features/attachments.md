# File Attachments

Attach images, videos, audio, and ZIP files to a leaf.

Attachments are stored in a dedicated private repository `{owner}/{repository}-media`, separate from your notes repository (created automatically on first attachment).

---

## How to Attach

There are three ways, all available while editing a leaf.

### Paste

Copy an image such as a screenshot and paste it into the editor with **Ctrl+V** (Cmd+V on Mac).

- Inserted at the cursor position
- Plain text pasting still works as usual (attachment kicks in only when files are included)

### Drag & Drop

Drop files onto the editor area.

- Inserted at the drop position
- Multiple files can be dropped at once

### Attach Button

Select files (multiple allowed) from the "**🖼️ Attach files**" button in the center of the footer.

- Inserted at the cursor position

---

## Inserted Syntax

| Type                     | Syntax            |
| ------------------------ | ----------------- |
| Images                   | `![name](rawURL)` |
| Video / audio / ZIP etc. | `[name](rawURL)`  |

The URL is finalized the moment you attach, so you can keep editing without waiting for the upload to finish.

---

## Supported Formats and Size Limit

- **Images**: png / jpg / jpeg / gif / webp / svg
- **Video**: mp4 / webm
- **Audio**: mp3 / m4a / ogg / wav
- **Other**: zip
- **Size limit**: 100MB per file

Unsupported formats and files over 100MB are rejected with a toast notification.

---

## Automatic Image Optimization

Attached images are optimized automatically (ON by default).

- Downscaled to a maximum edge of 2048px and converted to WebP
- gif (animation) and svg are stored as-is
- Can be turned off in the "**Editor**" section of the settings screen

> **💡 Tip**: Keeps pasted screenshots from bloating in size, so leaving it ON is recommended.

---

## Works Offline

Attaching while offline still completes the syntax insertion on the spot.

- The file content is stored in a local pending queue
- It uploads automatically when you come back online
- Failed uploads also stay in the queue and retry automatically

---

## Display in Preview

Open the preview (👁️) and attachments are displayed according to their type.

| Type      | Display                       |
| --------- | ----------------------------- |
| Image     | Shown inline                  |
| Video     | Player with playback controls |
| Audio     | Player with playback controls |
| ZIP, etc. | Link you can tap to download  |

- Already-fetched files appear instantly; the first time shows a brief "Loading..." state
- Files still on your device (right after attaching, or while offline) are displayed as-is
- If a file cannot be fetched (offline and not yet cached, or deleted), the file name and a "**Retry**" button are shown

---

## Note

- The media repository is private, so opening the inserted URL directly in a browser will not display it (GitHub authentication is required). The preview fetches it with authentication and displays it as described above
- "Download/Share as image" includes attached images, but video and audio are not captured
