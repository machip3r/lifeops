# Design

<!-- impeccable:design-schema 1 -->

## World

**LifeOps shell, archive structure** — dark blue-gray + golden accent (and a light shell variant), Lexend/Inter. Left icon rail that expands on hover; mobile full drawer from the right.

## Mode

Operate (dashboard shell).

## Palette

Shell uses CSS variables (`--lifeops-*`). Accent stays gold (`#FBDBAC` dark / `#c9a86c` light).

| Token | Dark | Light |
| --- | --- | --- |
| `--lifeops-chrome` | `#242830` | `#f4f4f5` |
| `--lifeops-page` | `#1a1d24` (+ gradient) | `#f0f0f2` |
| `--lifeops-border` | `#2a2f38` | `#d4d4d8` |
| `--lifeops-accent` | `#FBDBAC` | `#c9a86c` |

Theme: class `dark` on `<html>`, persisted in `localStorage` (`lifeops-theme`). Toggle under profile in sidebar.

## Typography

- Brand / headings: Lexend; UI: Inter / Geist
- Page watermark: large outlined letters via `-webkit-text-stroke` (~42% opacity)

## Components (shell)

- **Sidebar (desktop):** `w-16` → hover `260px`; labels fade via max-width/opacity (~300ms)
- **Sidebar (mobile):** full-width drawer from the **right**; larger touch targets
- **Nav item:** larger icons/text; active = gold fill + dark text
- **Footer:** profile, then theme + sign-out at 50% width each (`cursor-pointer`)
- **Page header:** solid accent `h1` + soft watermark
- **Dialogs:** `--lifeops-*` surfaces; solid accent titles (no gradient)

## Layout

Desktop: left icon rail + main. Mobile: centered LifeOps + burger right; drawer from right.
