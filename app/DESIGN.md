---
name: shōu
description: A calm visual library with searchable filters and equal portrait covers.
colors:
  primary: "#365b80"
  primary-hover: "#2c4f73"
  background: "#fff"
  foreground: "#263b52"
  heading: "#283f59"
  secondary: "#edf2f8"
  muted: "#f5f7fa"
  muted-foreground: "#607088"
  accent: "#eaf0f8"
  border: "#e2e8f0"
  ring: "#557ca7"
  control-surface: "#fafbfd"
  selected-surface: "#edf3fa"
  selected-border: "#a6bbd3"
  bookmark-surface: "#2e465a"
  blue-foreground: "oklch(49% .065 250)"
  blue-background: "oklch(96% .012 250)"
  cyan-foreground: "oklch(49% .065 220)"
  cyan-background: "oklch(96% .012 220)"
  steel-foreground: "oklch(49% .065 245)"
  steel-background: "oklch(96% .012 245)"
  lavender-foreground: "oklch(49% .065 290)"
  lavender-background: "oklch(96% .012 290)"
  indigo-foreground: "oklch(49% .065 270)"
  indigo-background: "oklch(96% .012 270)"
typography:
  display:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "39px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.035em"
  brand:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    letterSpacing: "-.04em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  control:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
  creator:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "-.015em"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  cover: "18px"
  cover-mobile: "15px"
  picker: "20px"
  panel: "25px"
  capsule: "999px"
spacing:
  filter-gap: "8px"
  chip-gap: "6px"
  grid-column-gap: "20px"
  grid-row-gap: "30px"
  grid-column-gap-mobile: "14px"
  grid-row-gap-mobile: "25px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.capsule}"
    padding: "11px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  filter:
    backgroundColor: "{colors.control-surface}"
    rounded: "{rounded.capsule}"
    padding: "6px 11px"
  filter-selected:
    backgroundColor: "{colors.selected-surface}"
    textColor: "{colors.primary}"
  category-chip:
    backgroundColor: "{colors.blue-background}"
    textColor: "{colors.blue-foreground}"
    rounded: "{rounded.capsule}"
    padding: "3px 7px"
  cover:
    backgroundColor: "{colors.secondary}"
    rounded: "{rounded.cover}"
  picker:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.picker}"
    width: "310px"
---

# Design System: shōu

## Overview

**Creative North Star: "A calm visual library"**

shōu uses white space, cool capsules, slate-blue actions, and equal portrait covers.
Manrope and the bookmark icon identify the product. The interface uses functional labels in Brazilian Portuguese.

This document describes the current app source in `app/library.tsx`, `app/globals.css`, and `app/interface.css`.

**Key Characteristics:**

- Floating control groups.
- Restrained cool classification accents.
- Equal portrait covers in an aligned grid.
- Searchable multi-select filters.
- Proportional sans-serif typography.

## Colors

The primary blue supports actions and selections. White and cool gray support the interface.
The muted foreground supports metadata and inactive navigation. Inactive navigation retains full opacity for readable text.
The recorded inactive navigation contrast is about 4.69:1 against its muted surface.

Classification accents share foreground lightness and chroma. Their backgrounds also share lightness and chroma.
Blue, cyan, steel, lavender, and indigo differ by hue. The app assigns category colors by their position within each card.
These colors do not encode a permanent category identity. Natural image colors remain unrestricted.

**The Equal Accent Rule.** Keep classification lightness and chroma constant; vary only hue.

## Typography

Self-hosted variable Manrope supplies the interface, with system sans-serif as the fallback.
The library heading uses the display role. Its size changes to 36px below 930px and 33px below 650px.
The brand uses the brand role. Creator handles use the creator role and wrap when necessary.
Controls use 12px text. Classification labels use 11px text; saved dates use 10px text.
Mobile search fields use 16px text. Mobile picker options use 14px text, and the picker title uses 18px text.
The interface uses no separate monospace role.

## Layout

The workspace has a maximum width of 1280px. Desktop width subtracts 72px from the viewport.
The top bar separates the brand, navigation, search, and account into floating groups.
The centered library heading precedes four filter pills and selected chips. The result count and order control precede the grid.

The grid uses five columns, four below 1180px, three below 930px, and two below 650px.
Below 1180px, workspace width subtracts 56px. Mobile workspace width subtracts 36px.
Below 930px, navigation occupies a second row. Below 650px, search occupies the second row and navigation occupies the third row.
Navigation remains available on mobile. Filter pills wrap and remain centered.

**The Equal Cover Rule.** Use one 9:16 frame for every cover, with object-fit cover and aligned grid rows.

The desktop picker is an anchored popover. Its result area keeps a fixed 244px height through loading, empty, and error states.
The mobile picker is a bottom sheet below 650px. Its maximum height is `calc(100dvh - 12px)`.
Its result height is `clamp(80px,calc(100dvh - 320px),340px)`.
The pinned selection area scrolls separately and has a maximum height of `min(100px,12dvh)`.
The heading, search field, and actions sit outside the result scroll area.
The sheet includes the bottom safe-area inset.

## Elevation & Depth

Soft shadows lift floating controls and image frames. Cool borders separate controls, menus, and panels.
The search shadow is `0 4px 13px #263b5206`. Cover shadows use `0 3px 10px #263b5209`.
The picker shadow is `0 16px 45px #263b5226`. The sheet shadow is `0 -9px 30px #263b521c`.
Panel shadows use `0 20px 65px #13294129`. An overlay separates modal panels from the library.

Cover hover scales imagery to 1.035 over .38s. The grid enters over .28s with a 5px vertical movement.
The picker enters over .16s. The sheet enters over .24s with an 18px vertical movement.
These movements use `cubic-bezier(.16,1,.3,1)`. Reduced-motion preferences remove animations and transitions.

## Shapes

Capsules frame navigation, filters, and primary actions. The cover radius decreases on mobile.
The bookmark sits in a 35px by 39px blue tile with an 11px radius.
Playback and source controls are circular. A bottom gradient supports their white icons.
The popover uses rounded corners on all sides. The mobile sheet uses rounded top corners and a flat bottom edge.

## Components

### Buttons

Primary actions use blue surfaces and white text. Hover darkens the primary action.
Keyboard focus uses a 3px ring with a 4px offset. Cover controls use a white inset focus ring.
The primary reset action has a minimum height of 43px. Cover controls have a minimum size of 35px.
Disabled actions remain unavailable while requests run or required values are absent.

### Chips

Filter pills show selected counts. A blue count circle and a tinted surface identify active groups.
The selected-chip row shows the first three values and a +N summary. Each visible chip removes one selected value.
The picker retains the complete selection list. Category chips use the cool accent family; topics use muted text.

### Cards / Containers

Cards show a cover, creator, category, topic, and saved date. They include playback, source, and action controls.
Incomplete or unavailable states appear as functional badges over the cover. Missing covers use a bookmark placeholder.
Cards do not show transcript, description, or analysis text.
The card menu provides classification, removal, or restore actions for the applicable state.

### Inputs / Fields

The search capsule surrounds an accessible input. Focus gives the capsule a 2px outline with a 3px offset.
Ctrl+K or Command+K focuses search. The order control offers best match and most recently saved first.
The clear action resets search and filters and returns focus to search.
Empty results provide a reset action. Loading and request failures show functional status or retry controls.

### Navigation

Biblioteca and Removidos share a muted capsule. The active destination uses a white surface and blue text.
The inactive destination uses muted text at full opacity. Both expose their selected state through aria-pressed.
The account group provides settings and sign-out actions. A skip link gives keyboard access to the library.

### Searchable Multi-select Picker

Categoria, Tópico, Criador, and Coleção use the same picker. Opening the picker focuses its search field.
Selections apply immediately. Values within a group are alternatives; different groups narrow results together.
No selected value means that the group does not filter results.

Selected values stay pinned and checked when the query changes. The result list excludes these pinned values.
Facet search uses a 120ms delay and cancels outdated searches. More results load through an explicit action.
Failed requests retain selections and show Tentar novamente. Loading and empty states use the same result-area height.
Limpar clears the group. Concluir closes the picker without reversing selections.

Arrow keys move focus through the result checkboxes. Space toggles a focused checkbox.
Escape closes the picker. Radix manages closure and focus return to the originating pill.
The mobile dialog provides modal focus containment. Search, selected values, and actions retain the same behavior.

### Settings and Dialogs

Settings use a centered panel on desktop and a bottom sheet on mobile.
Category, topic, and collection controls provide functional editing actions. Reclassification requires an explicit checkbox selection.
Classification and playback use rounded modal panels. The playback panel includes an explicit Instagram source link.
Notifications provide a visible close action. Their text describes the completed action or the request failure.
Dismiss each notification after five seconds. Restart the timer for each new notification, including repeated text.

## Do's and Don'ts

- Do retain the shōu name, Manrope, and bookmark icon.
- Do use equal 9:16 covers and aligned grid rows.
- Do keep classification accents at common lightness and chroma.
- Do retain selections during search, pagination, and request failures.
- Do keep result-area heights stable across picker states.
- Do use functional labels and visible keyboard focus.
- Do respect reduced-motion preferences.

- Don't use beige interface surfaces or masonry.
- Don't add explanatory or marketing copy to the interface.
- Don't expose internal transcript, description, or analysis text in cards.

### Playback navigation

The whole cover opens playback. The source link remains a separate control.
The player follows the current result order and loads the next result page when needed.
Touch navigation uses a 44px side area outside the Instagram embed. The embed retains its controls.
Use vertical swipes in that area, arrow buttons, or keyboard arrows to change the reference.
Mobile playback fills the viewport. Closing playback restores focus to the original cover.

### Library scrolling

Load the next result page within 1800px of the viewport. Keep one page request active.
Preserve loaded cards and the scroll position after removal or restore. Adjust the cursor after a loaded item leaves the list.
Keep loaded cards after a page request fails. Show an explicit retry action.
Load the first five covers immediately. Start other cover requests within 1800px of the viewport.
Use private browser caching for versioned covers. Keep the existing cover dimensions during loading.

Keep 64px of bottom padding on desktop and 48px below 650px. Add the device safe-area inset.
Keep this padding on the workspace when pagination ends.
