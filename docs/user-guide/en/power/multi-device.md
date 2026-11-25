# Multi-Device Sync

Notes when using across multiple devices like PC and smartphone.

---

## Basic Flow

1. Edit on **Device A** → Push
2. Pull on **Device B** → Edit → Push
3. Pull on **Device A** → ...

---

## Caution

- On a conflict, if the changes do not overlap, "Merge both changes to resolve" keeps both sides ([Merging Both Changes](../basics/sync.md#merging-both-changes))
- If the changes overlap (for example, the same line edited on both devices), nothing is merged automatically. Overwriting with either side loses the other side's changes
- Pulling before you edit reduces conflicts in the first place

---

## Stale Warning

If edits were made on another device, a warning appears before Push.

- You can choose to overwrite or Pull first (or merge both, if the changes do not overlap)
- Background checks also run every 5 minutes
