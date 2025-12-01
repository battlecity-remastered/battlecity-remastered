const STORAGE_KEY = "battlecity.controlPreferences";

const DEFAULT_PREFERENCES = Object.freeze({
  joystickControlsEnabled: false,
  showMobileControls: false,
});

const normaliseBoolean = (value) => {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return !!value;
};

export const normaliseControlPreferences = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    joystickControlsEnabled: normaliseBoolean(source.joystickControlsEnabled),
    showMobileControls: normaliseBoolean(source.showMobileControls),
  };
};

export const loadControlPreferences = () => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { ...DEFAULT_PREFERENCES };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFERENCES,
      ...normaliseControlPreferences(parsed),
    };
  } catch (_error) {
    return { ...DEFAULT_PREFERENCES };
  }
};

export const persistControlPreferences = (prefs) => {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    const normalised = normaliseControlPreferences(prefs);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalised));
  } catch (_error) {
    // Ignore persistence failures; the defaults will load on the next launch.
  }
};

export const CONTROL_PREFERENCE_DEFAULTS = { ...DEFAULT_PREFERENCES };
