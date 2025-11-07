# Dark Mode Feature

## Overview

The Apollo application now supports both light and dark themes for the "Select GitHub Repository" modal and the entire application interface.

## Features

### Theme Toggle

- **Location**: User menu dropdown (click on your user name in the top right)
- **Icon**: Sun icon for light mode, Moon icon for dark mode
- **Functionality**: Click to instantly switch between light and dark themes

### Theme Persistence

- Your theme preference is automatically saved to browser localStorage
- The selected theme persists across page reloads and browser sessions
- Key used: `theme_preference`

### System Preference Detection

- On first visit, the application automatically detects your system's theme preference
- Uses `prefers-color-scheme` media query
- Defaults to dark mode if system preference cannot be detected

## Technical Implementation

### Theme Store (`src/lib/stores/themeStore.ts`)

- Centralized theme management using Svelte stores
- Handles localStorage persistence
- Provides `get()`, `set()`, `toggle()`, and `init()` methods
- Type-safe with TypeScript (`'light' | 'dark'`)

### Theme Toggle Component (`src/lib/ThemeToggle.svelte`)

- Reusable Svelte component
- SVG icons for sun (light) and moon (dark)
- Accessible with proper ARIA labels
- Smooth transitions

### CSS Variables

The modal and UI elements use CSS variables for theming:

- Light theme: Clean white backgrounds with subtle gray accents
- Dark theme: Dark backgrounds with high contrast for readability

### Supported Elements

- Modal backdrop
- Modal content background and borders
- Text (primary, secondary, muted)
- Input fields and search boxes
- Buttons and interactive elements
- Info banners
- Error messages
- Repository list items
- Badges (private, organization)

## Usage

### For Users

1. Click on your user avatar/name in the top right corner
2. In the dropdown menu, find the "Theme" option with a toggle button
3. Click the toggle to switch between light and dark modes
4. The theme will be applied immediately and saved for future visits

### For Developers

#### Using the Theme Store

```typescript
import { themeStore } from '$lib/stores/themeStore';

// Get current theme
const currentTheme = themeStore.get(); // 'light' | 'dark'

// Set theme
themeStore.set('dark');
themeStore.set('light');

// Toggle theme
themeStore.toggle();

// Initialize theme (call once on app mount)
themeStore.init();
```

#### Adding Theme Support to New Components

1. Define CSS variables for both themes in your component styles:

```css
:global([data-theme='light']) {
	--my-bg-color: #ffffff;
	--my-text-color: #1a1a1a;
}

:global([data-theme='dark']) {
	--my-bg-color: #111111;
	--my-text-color: #e5e5e5;
}

.my-element {
	background: var(--my-bg-color);
	color: var(--my-text-color);
}
```

2. The theme will automatically apply based on the `data-theme` attribute on `<html>`

## Screenshots

### Dark Mode

![Dark Mode Modal](https://github.com/user-attachments/assets/b359ad11-5bc1-4f8d-88eb-5e7f2d334024)

### Light Mode

![Light Mode Modal](https://github.com/user-attachments/assets/a384c0f2-940c-4985-9ce2-faef631bbf91)

## Accessibility

- High contrast ratios in both themes for readability
- Clear visual indicators for the current theme
- Proper ARIA labels on the theme toggle button
- Keyboard accessible

## Browser Support

- All modern browsers that support CSS custom properties (CSS variables)
- localStorage API for theme persistence
- `prefers-color-scheme` media query for system preference detection

## Future Enhancements

- Auto-switch based on time of day
- Additional theme options (e.g., high contrast, custom colors)
- Theme preview before applying
- Sync theme across multiple devices
