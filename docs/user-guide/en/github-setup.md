# GitHub Integration Setup Guide

Agasteer uses GitHub as the storage location for your notes. Without GitHub integration, you can only use temporary offline notes in your browser (notes will be deleted if you clear browser data).

With GitHub integration:

- Notes are saved to GitHub and **accessible from any device**
- **Automatic sync** between PC and mobile
- **Backups** of your notes are automatically saved

Setup requires **creating a repository** and **obtaining a Personal Access Token**. Follow the steps below (approximately 5-10 minutes).

---

## 1. Create a Repository

Create a GitHub repository to store your notes.

### Step 1: Select New repository

Log in to GitHub and select "New repository" from the "+" button in the top right corner.

![New repository](../../images/setup/r1.webp)

### Step 2: Create the repository

Create the repository with the following settings:

![Create repository](../../images/setup/r2.webp)

| No. | Item                  | Setting                                   |
| :-: | --------------------- | ----------------------------------------- |
|  1  | **Repository name**   | Any name you like (e.g., `memo`, `notes`) |
|  2  | **Visibility**        | Select "Private"                          |
|  3  | **Create repository** | Click the button                          |

Enter the repository name you created (e.g., `memo`) in Agasteer's settings screen.

---

## 2. Obtain a Personal Access Token

Obtain a token to use GitHub's API.

### Step 1: Open Settings

Click your profile icon in the top right corner and select "Settings".

![Settings](../../images/setup/k1.webp)

### Step 2: Open Developer settings

Click "Developer settings" at the bottom of the left sidebar.

![Developer settings](../../images/setup/k2.webp)

### Step 3: Select Fine-grained tokens

Select "Personal access tokens" → "Fine-grained tokens", then click "Generate new token".

![Fine-grained tokens](../../images/setup/k3.webp)

### Step 4: Configure the token

Configure the following items:

![Token settings](../../images/setup/k4.webp)

| No. | Item                  | Setting                                                                                                                |
| :-: | --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
|  1  | **Token name**        | A descriptive name (e.g., `agasteer`)                                                                                  |
|  2  | **Expiration**        | Select any expiration period (e.g., 90 days). "No expiration" is convenient but expiration is recommended for security |
|  3  | **Repository access** | Select "Only select repositories" and choose the repository you created                                                |
|  4  | **Permissions**       | Set "Contents" to "Read and write"                                                                                     |
|  5  | **Generate token**    | Click the button                                                                                                       |

### Step 5: Copy the token

Copy the generated token.

> **Important**: The token is only displayed once. Make sure to copy it from this screen.

![Copy token](../../images/setup/k5.webp)

Enter the copied token in Agasteer's settings screen.

---

## 3. Configure in Agasteer

1. Open Agasteer's settings screen
2. Enter the copied token in "GitHub Token" (left field)
3. Enter `username/repository-name` in "GitHub Repository" (right field, e.g., `kako-jun/memo`)
4. Test the connection with the "Test Connection" button

If the settings are correct, your notes will sync with GitHub.

### Switching Repositories

If you want to use multiple repositories (e.g., one for daily notes and another for a dedicated project):

1. Tap the "▼" button next to the repository input field
2. Previously connected repositories appear in a dropdown
3. Select the repository you want to switch to
4. You can also type a new repository name directly

> **Tip**: To access multiple repositories with the same token, select all target repositories when creating the token, or choose "All repositories".

Use the "×" button on each dropdown entry to remove a repository from the history.

---

## Troubleshooting

### "Bad credentials" error

- Verify the token was copied correctly
- Check if the token has expired

### "Not Found" error

- Verify the repository name is in `username/repository-name` format
- Check if the token has access permissions to the correct repository

### If you forgot your token

Tokens cannot be displayed again. Generate a new token.

> **Tip**: Click the copy button next to the token input field in Agasteer's settings screen to copy the saved token to clipboard. This is useful when setting up another device.

---

## Related Documentation

- [Basic Operations](./basic-usage.md) - How to use Push/Pull
- [Power User](./power-user.md) - GitHub integration details
- [FAQ](./faq.md)
