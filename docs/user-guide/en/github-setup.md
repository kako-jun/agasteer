# GitHub Setup Guide

Agasteer uses GitHub as the storage for your notes. Without GitHub integration, you can only use temporary offline notes stored in your browser (which will be lost if you clear browser data).

With GitHub integration:

- Notes are saved to GitHub, **accessible from any device**
- **Automatic sync** between PC and mobile
- **Automatic backup** of all your notes

Setup requires **creating a repository** and **obtaining a Personal Access Token**. Follow the steps below (about 5-10 minutes).

---

## 1. Create a Repository

Create a GitHub repository to store your notes.

### Step 1: Select New repository

Log in to GitHub and click the "+" button in the top right, then select "New repository".

![New repository](../../images/setup/r1.webp)

### Step 2: Create the repository

Create the repository with the following settings:

![Create repository](../../images/setup/r2.webp)

|  #  | Field                 | Setting                                   |
| :-: | --------------------- | ----------------------------------------- |
|  ①  | **Repository name**   | Any name you like (e.g., `memo`, `notes`) |
|  ②  | **Visibility**        | Select "Private"                          |
|  ③  | **Create repository** | Click the button                          |

Enter the repository name (e.g., `memo`) in Agasteer's settings screen.

---

## 2. Get a Personal Access Token

Obtain a token to use the GitHub API.

### Step 1: Open Settings

Click your profile icon in the top right and select "Settings".

![Settings](../../images/setup/k1.webp)

### Step 2: Open Developer settings

Click "Developer settings" at the bottom of the left sidebar.

![Developer settings](../../images/setup/k2.webp)

### Step 3: Select Fine-grained tokens

Select "Personal access tokens" → "Fine-grained tokens", then click "Generate new token".

![Fine-grained tokens](../../images/setup/k3.webp)

### Step 4: Configure the token

Configure the following settings:

![Token settings](../../images/setup/k4.webp)

|  #  | Field                 | Setting                                                                                                                    |
| :-: | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
|  ①  | **Token name**        | A descriptive name (e.g., `agasteer`)                                                                                      |
|  ②  | **Expiration**        | Choose any expiration (e.g., 90 days). "No expiration" is convenient but setting an expiration is recommended for security |
|  ③  | **Repository access** | Select "Only select repositories" and choose the repository you created                                                    |
|  ④  | **Permissions**       | Set "Contents" to "Read and write"                                                                                         |
|  ⑤  | **Generate token**    | Click the button                                                                                                           |

### Step 5: Copy the token

Copy the generated token.

> **Important**: The token is only shown once. Make sure to copy it on this screen.

![Copy token](../../images/setup/k5.webp)

Enter the copied token in Agasteer's settings screen.

---

## 3. Configure in Agasteer

1. Open Agasteer's settings screen
2. Enter `username/repository-name` in "GitHub Repository" (e.g., `kako-jun/memo`)
3. Enter the copied token in "GitHub Token"
4. Click "Pull" to test the connection

If configured correctly, your notes will sync with GitHub.

---

## Troubleshooting

### "Bad credentials" error

- Verify the token was copied correctly
- Check if the token has expired

### "Not Found" error

- Verify the repository name is in `username/repository-name` format
- Check if the token has access to the correct repository

### Forgot your token?

Tokens cannot be displayed again. Generate a new token.

---

## Related Documentation

- [GitHub Sync](./github-sync.md)
- [FAQ](./faq.md)
