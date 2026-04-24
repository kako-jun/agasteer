# Search

Use the search box on the home screen to search across note names, leaf names, and content.

---

## How Search Works

1. Enter a keyword in the search box
2. Results are displayed in real-time
3. Click a result to open the matched note or leaf
4. When a content match is opened, the editor jumps to the matched line

### Split behavior in two-pane view

When the window is in two-pane layout (landscape), each search result row is split horizontally.

- **Click the left half** → open in the left pane (existing behavior)
- **Click the right half (tinted area)** → open in the right pane
- Useful for keeping the results list in the left pane while inspecting matches on the right

In single-pane view (portrait phones, etc.) the split is hidden and clicking anywhere opens in the current pane.

---

## Search Priority

1. **Note name match** → Displayed first
2. **Leaf name match** → Displayed second
3. **Content match** → Displayed last

---

## Search Scope

- Regular notes and leaves (Home world)
- **Offline leaf** (local-only memo) is also included in search
- **Notes and leaves in Archive** (only when Archive is loaded)

> **Tip**: To search within the Archive, you need to load it from GitHub first. Search results from the Archive are displayed with an "Archive/" prefix. When the Archive is not loaded, a notice appears at the bottom of the search results.
