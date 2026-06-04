# MyCloud Future Plans

## Folder Navigator and Details Panel

When a user opens any folder, transform the left panel into a folder-focused workspace similar to Windows File Explorer.

### Goal

Make folder navigation faster by letting users jump directly between nearby folders and see information about the currently selected file or folder without opening a separate modal.

### Left Panel Layout

Split the left panel into two sections while inside a folder:

- Navigator
- Selected Item Information

### Navigator Section

Show a clickable folder navigator for the current location.

Expected behavior:

- Display the current folder path as a navigable tree or breadcrumb-style folder list.
- Show nearby folders and child folders when possible.
- Clicking a folder in the navigator should open that folder directly.
- Keep the selected/current folder visually highlighted.
- Allow quick jumps back to parent folders.

### Selected Item Information Section

Show details for the currently selected file or folder.

Suggested details:

- Name
- Type
- Full path
- Size
- Modified time
- Favorite status
- Sharing status
- Permission/access summary

For folders, optionally show:

- Number of files
- Number of subfolders
- Total folder size, if available from indexing.

### UI Notes

- On the dashboard, keep the normal left sidebar.
- When entering a folder, switch the left sidebar into Navigator mode.
- When leaving folder view, restore the normal sidebar.
- On smaller mobile screens, show this as a collapsible drawer or bottom sheet.
