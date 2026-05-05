# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Open `index.html` directly in a browser:
- Double-click `index.html`, or
- `start index.html` (Windows), `open index.html` (macOS)

## Architecture

Single-page app — three files, no dependencies, no build toolchain.

| File | Role |
|------|------|
| `index.html` | Structure and DOM skeleton |
| `style.css` | All styling via CSS custom properties (`:root` vars) |
| `app.js` | All state, logic, and DOM manipulation |

### State model (`app.js`)

- `todos` — in-memory array of todo objects, kept in sync with `localStorage` under key `todos`
- `currentFilter` — `'all' | 'work' | 'personal' | 'study'`
- `pendingDeleteId` — holds the id of the todo awaiting deletion confirmation

Todo object shape:
```json
{ "id": "1714694400000", "text": "...", "category": "work|personal|study",
  "completed": false, "createdAt": "2026-05-03T09:00:00.000Z" }
```

### Rendering

`render()` is the single re-render entry point. It calls `getFiltered()` to apply `currentFilter`, updates the progress bar based on that filtered set, then rebuilds the `#todo-list` via `buildItem()`.

Inline edit mode works by directly replacing DOM nodes inside the `<li>` (badge → `<select>`, text span → `<input>`). Saving or cancelling calls `render()` to restore normal view.

Progress bar width is CSS-transitioned; the celebration toast auto-hides after 3 s. The delete confirmation uses a modal overlay (`#overlay` + `#delete-dialog`) controlled by `openDeleteDialog` / `closeDeleteDialog`.

## Categories

Three fixed categories with colour tokens in `style.css`:

| Key | Label | CSS class | Colour var |
|-----|-------|-----------|-----------|
| `work` | 업무 | `cat-work` | `--cat-work` (#4a7fe5 blue) |
| `personal` | 개인 | `cat-personal` | `--cat-personal` (#27ae60 green) |
| `study` | 공부 | `cat-study` | `--cat-study` (#e67e22 orange) |

To add or rename a category, update `CATEGORY_LABEL`, `CATEGORY_CLASS` in `app.js` and add a corresponding CSS rule in `style.css`.
