# Initial Guide

Guide features for first-time Agasteer users.

---

## Welcome Popup

A popup displayed on first access.

### Features

- **Auto language detection**: Displays in Japanese or English based on browser language settings
- **Responsive**: Buttons automatically arrange vertically on mobile
- Tap "Get Started" to go to home screen

### Options

| Button           | Description                          |
| ---------------- | ------------------------------------ |
| **Get Started**  | Start without GitHub integration     |
| **GitHub Setup** | Open settings for GitHub integration |
| **Setup Guide**  | Open setup guide in new tab          |

---

## Tooltip Guide

Shows hints in tooltips near buttons during first-time operations.

### When Displayed

| Condition                       | Tooltip Content                    |
| ------------------------------- | ---------------------------------- |
| When note count is 0            | "Click here to create a note"      |
| When leaf count is 0            | "Click here to create a leaf"      |
| When editing for the first time | "Save to GitHub to keep your data" |

### How to Dismiss Tooltips

- Click the relevant button
- Click the tooltip itself (× button)

Once dismissed, they won't appear again.

---

## How to Reset the Guide

Run the following in the developer console and reload:

```js
const data = JSON.parse(localStorage.getItem('agasteer'))
data.globalState.tourShown = false
data.globalState.saveGuideShown = false
localStorage.setItem('agasteer', JSON.stringify(data))
```
