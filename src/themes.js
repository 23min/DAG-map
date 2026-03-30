// ================================================================
// themes.js — Theme definitions for dag-map
// ================================================================
// Five built-in themes plus custom theme support via resolveTheme().
//
// The class names (pure, recordable, side_effecting, gate) are defaults.
// Users can use any string keys they want — just pass matching keys in
// the node `cls` field and in a custom theme's `classes` object.

export const THEMES = {
  cream: {
    paper: '#F5F0E8', ink: '#2C2C2C', muted: '#8C8680', border: '#D4CFC7',
    classes: { pure: '#2B8A8E', recordable: '#E8846B', side_effecting: '#D4944C', gate: '#C45B4A', pending: '#B0AAA0' }
  },
  light: {
    paper: '#FAFAFA', ink: '#333333', muted: '#999999', border: '#E0E0E0',
    classes: { pure: '#0077B6', recordable: '#E36414', side_effecting: '#6C757D', gate: '#DC3545', pending: '#BDBDBD' }
  },
  dark: {
    paper: '#1E1E2E', ink: '#CDD6F4', muted: '#6C7086', border: '#313244',
    classes: { pure: '#94E2D5', recordable: '#F38BA8', side_effecting: '#F9E2AF', gate: '#EBA0AC', pending: '#45475A' }
  },
  blueprint: {
    paper: '#1B2838', ink: '#E0E8F0', muted: '#5A7A9A', border: '#2A4060',
    classes: { pure: '#4FC3F7', recordable: '#FF8A65', side_effecting: '#FFD54F', gate: '#EF5350', pending: '#3D5A7A' }
  },
  mono: {
    paper: '#FFFFFF', ink: '#1A1A1A', muted: '#888888', border: '#CCCCCC',
    classes: { pure: '#444444', recordable: '#777777', side_effecting: '#999999', gate: '#333333', pending: '#AAAAAA' }
  },
  metro: {
    paper: '#FFFFFF', ink: '#1A1A1A', muted: '#9E9E9E', border: '#D4EAF7',
    classes: { pure: '#0078C8', recordable: '#E3242B', side_effecting: '#F5A623', gate: '#6A2D8E', pending: '#BDBDBD' },
    lineOpacity: 1.4
  }
};

/**
 * Resolve a theme option to a full theme object.
 *
 * @param {string|object} [themeOption] - theme name string, custom theme object, or undefined
 * @returns {object} resolved theme with paper, ink, muted, border, and classes
 */
export function resolveTheme(themeOption) {
  if (!themeOption || themeOption === 'cream') return THEMES.cream;
  if (typeof themeOption === 'string') return THEMES[themeOption] || THEMES.cream;
  // Custom theme object — merge with cream defaults
  return { ...THEMES.cream, ...themeOption, classes: { ...THEMES.cream.classes, ...(themeOption.classes || {}) } };
}
