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

The URL is finalized the moment you attach, and the syntax is inserted right then—without waiting for the upload to finish. Because the insert runs right after the local processing (optimizing and queuing, a few milliseconds) rather than after the upload completes, the window in which switching to another leaf or toggling the preview (👁️) right after attaching could drop the inserted syntax shrinks to practically nothing. The upload keeps going in the background, and if it fails it stays in the queue and retries automatically.

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
- Pushing while an attachment is still being processed (image optimization / saving) waits for the insertion to land first, so the inserted reference is never left out of the push

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

## Listing and Deleting Media

You can review and delete attached media from a dedicated screen.

### Opening it

From the "**›**" dropdown at the left of the breadcrumbs (the Home/Archive switcher), choose "**Media**". To go back, tap the home icon in the breadcrumbs, or choose "Home" from the same dropdown.

### The list

- Attached files are shown in a grid with thumbnails (newest first)
- Images show a thumbnail; video, audio, ZIP, etc. show an extension label
- Each file shows its name and size
- If you have not attached anything yet, it shows "No attachments yet"
- There is no practical limit on the number of attachments (only in extreme cases will you see a "showing a partial list" notice)
- Files not referenced by any note are labeled "**Unreferenced**" (a sign they are safe to delete). While the archive has not been loaded yet, the check is on hold and a notice explains this

### Deleting

Delete a file with its delete button (🗑️). A confirmation dialog asks whether to delete.

> **⚠️ Note**: If the media you delete is referenced by any note, that note will display broken (the image won't show, or the link will break). Files labeled "**Unreferenced**" are not referenced anywhere and are safe to delete.

---

## About Storage Size

The media repository uses a **history-less storage scheme**. Unlike a normal Git repository, past versions do not accumulate:

- Storage is only the total of the files that currently exist
- **Deleting a file actually frees its space** (nothing lingers in history)
- No special action is needed (this happens automatically)

> **📝 Note**: GitHub's displayed repository size may update with a delay, due to GitHub-side cleanup timing.

---

## Note

- The media repository is private, so opening the inserted URL directly in a browser will not display it (GitHub authentication is required). The preview fetches it with authentication and displays it as described above
- If you use a **fine-grained token** with the setup guide's configuration (selected repositories only, Contents permission only), the media repository cannot be created automatically (that configuration does not include repository-creation permission). Create a private repository named `{your-repo-name}-media` yourself and add it to the token's "Repository access" **alongside your notes repository**. With a classic token (`repo` scope), it is created automatically on first attachment
- "Download/Share as image" includes attached images, but video and audio are not captured
