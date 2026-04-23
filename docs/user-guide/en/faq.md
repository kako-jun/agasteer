# FAQ (Frequently Asked Questions)

> Common questions and answers about Agasteer.

---

## Basic Questions

### Q: Do I need a server?

**A:** No, it runs entirely in the browser. It can be hosted on static hosting (Cloudflare Pages, GitHub Pages, etc.).

### Q: Can I use it offline?

**A:** Yes, once loaded you can edit offline. However, GitHub sync requires an internet connection.

### Q: Does it work on mobile?

**A:** Yes, with responsive design it works comfortably on smartphones. With PWA support, you can add it to your home screen and use it like a native app.

### Q: Is GitHub integration required?

**A:** Yes, GitHub integration is required to create notes and leaves. Enter your repository name and token in the settings screen and perform a Pull to get started.

---

## Data Management

### Q: Where is my data stored?

**A:** In 3 locations:

| Data                | Storage Location             |
| ------------------- | ---------------------------- |
| Notes & Leaves      | IndexedDB (browser) + GitHub |
| Settings            | LocalStorage (browser)       |
| Fonts & Backgrounds | IndexedDB (browser only)     |

### Q: Can I import existing Markdown files?

**A:** Yes, there are 2 ways:

1. **Import feature**: Import Agasteer format (ZIP) or SimpleNote format (JSON) from the settings screen
2. **Manual placement**: Place Markdown files in `.agasteer/notes/` on GitHub and perform a Pull

### Q: Do I need to backup my data?

**A:** Recommended. IndexedDB can be cleared when you clear browser cache.

- Set up GitHub sync for backup
- Export to save locally

### Q: Can I have more than 2 levels of note hierarchy?

**A:** No, it's limited to 2 levels (Note → Sub-note). This is by design to keep things simple.

---

## Sync

### Q: Can I sync across multiple devices?

**A:** Yes, you can sync by Pull/Push to the same GitHub repository.

**Note**: Conflict resolution UI is not yet implemented. If you edit simultaneously on multiple devices, the data from the later Push will overwrite.

### Q: How much does it cost?

**A:** GitHub's free plan is sufficient.

| Usage Pattern | Pull/Push Count | Cost     |
| ------------- | --------------- | -------- |
| Light usage   | ~30/month       | **Free** |
| Normal usage  | ~100/month      | **Free** |
| Heavy usage   | ~300/month      | **Free** |

No cost as long as you stay within GitHub API rate limits (5,000 requests/hour).

---

## Images & Media

### Q: Can I embed images?

**A:** Markdown image syntax works, but there's no image upload feature.

Methods:

1. Place images in `images/` on GitHub and reference with `![description](./images/example.png)`
2. Use an external image hosting service (Imgur, etc.)

### Q: Can I embed videos or audio?

**A:** Yes, by using HTML tags in Markdown.

```html
<video src="https://example.com/video.mp4" controls></video>
```

---

## Troubleshooting

### Q: Push is failing

Check the following:

1. Is the GitHub Token correct?
2. Does the token have the `repo` scope (or Contents: Read and write)?
3. Is the repository name in `owner/repo` format?
4. Has the token expired?

### Q: Pull is failing

Check the following:

1. Is the GitHub Token correct?
2. Is the repository name correct?
3. Does the repository exist?

### Q: My data disappeared

Possible causes:

1. You cleared browser cache
2. You were using private/incognito mode
3. You're using a different browser/profile

**Solution**: If you're using GitHub sync, perform a Pull to restore your data.

### Q: Vim mode isn't working

Check the following:

1. Is Vim mode enabled in settings?
2. Have you clicked the editor to focus it?
3. Have you pressed Esc to return to normal mode?

### Q: On Android, tapping empty lines causes scroll to jump

**A:** This is a compatibility issue with Gboard (Google Japanese Input).

Agasteer suppresses the immediate tap-triggered auto-scroll and then keeps the cursor visible after the keyboard appears. Even with that mitigation, tapping empty lines (blank lines between paragraphs) may still cause unexpected scroll jumps because of Gboard behavior.

**Workaround**: Instead of tapping empty lines, tap a line with text and then move the cursor.

### Q: What's the vertical line on the left side of the header?

**A:** It's a progress bar showing time until the next stale check.

- Automatically checks for remote changes every 5 minutes
- When the bar is full (5 minutes elapsed), a check is performed
- If changes were made on another device, a red dot appears on the Pull button

---

## Other

### Q: I found a bug

Please report it on GitHub Issues.

- **Repository**: [agasteer](https://github.com/kako-jun/agasteer)

### Q: Can I request new features?

Yes, we accept feature requests on GitHub Issues.

### Q: I want to contribute

Welcome! Please see CONTRIBUTING.md.

### Q: I want to support development

You can support via GitHub Sponsors. Access it from the heart icon link at the bottom of the settings screen.

---

## Related Documentation

- [Quick Start](./quick-start.md)
- [Basic Operations](./basic-usage.md)
- [GitHub Integration Setup](./github-setup.md)
