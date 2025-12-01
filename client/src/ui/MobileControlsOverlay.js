const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(min, Math.min(max, value));
};

const createElement = (tag, className, styles = {}) => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  Object.assign(element.style, styles);
  return element;
};

class MobileControlsOverlay {
  constructor(options = {}) {
    this.onAnalogInput =
      typeof options.onAnalogInput === "function"
        ? options.onAnalogInput
        : null;
    this.onAnalogRelease =
      typeof options.onAnalogRelease === "function"
        ? options.onAnalogRelease
        : null;
    this.onDigitalInput =
      typeof options.onDigitalInput === "function"
        ? options.onDigitalInput
        : null;
    this.onDigitalRelease =
      typeof options.onDigitalRelease === "function"
        ? options.onDigitalRelease
        : null;
    this.onFire = typeof options.onFire === "function" ? options.onFire : null;
    this.pointerId = null;
    this.isJoystickMode = false;
    this.isVisible = false;
    this.lastDigitalState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.root = this.createOverlayRoot();
    this.joystickBase = this.createJoystick();
    this.fireButton = this.createFireButton();
    this.root.appendChild(this.joystickBase.container);
    this.root.appendChild(this.fireButton.container);
    const host = document.getElementById("game") || document.body;
    host.appendChild(this.root);
    this.updateVisibility();
  }

  createOverlayRoot() {
    const root = createElement("div", "mobile-controls-overlay", {
      position: "absolute",
      bottom: "24px",
      left: "16px",
      right: "16px",
      display: "none",
      justifyContent: "space-between",
      alignItems: "flex-end",
      pointerEvents: "none",
      zIndex: 12000,
      gap: "16px",
    });
    return root;
  }

  createJoystick() {
    const container = createElement("div", "mobile-joystick", {
      width: "160px",
      height: "160px",
      pointerEvents: "auto",
      background: "rgba(8, 15, 30, 0.55)",
      borderRadius: "80px",
      border: "1px solid rgba(109, 183, 255, 0.35)",
      position: "relative",
      touchAction: "none",
    });
    const thumb = createElement("div", "mobile-joystick-thumb", {
      width: "70px",
      height: "70px",
      borderRadius: "35px",
      background: "rgba(150, 199, 255, 0.85)",
      boxShadow: "0 8px 18px rgba(8, 15, 30, 0.45)",
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-35px, -35px)",
      transition: "transform 0.08s ease-out",
    });
    container.appendChild(thumb);
    container.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      container.setPointerCapture(event.pointerId);
      this.pointerId = event.pointerId;
      this.updateJoystickFromEvent(event);
    });
    container.addEventListener("pointermove", (event) => {
      if (this.pointerId !== event.pointerId) {
        return;
      }
      this.updateJoystickFromEvent(event);
    });
    const resetJoystick = () => {
      this.pointerId = null;
      thumb.style.transform = "translate(-35px, -35px)";
      if (this.isJoystickMode) {
        this.onAnalogRelease && this.onAnalogRelease();
      } else {
        this.onDigitalRelease && this.onDigitalRelease();
      }
      this.lastDigitalState = {
        up: false,
        down: false,
        left: false,
        right: false,
      };
    };
    container.addEventListener("pointerup", (event) => {
      if (this.pointerId !== event.pointerId) {
        return;
      }
      container.releasePointerCapture(event.pointerId);
      resetJoystick();
    });
    container.addEventListener("pointercancel", () => {
      if (this.pointerId !== null) {
        resetJoystick();
      }
    });

    this.joystickThumb = thumb;
    return { container, thumb };
  }

  createFireButton() {
    const container = createElement("div", "mobile-fire-button", {
      pointerEvents: "auto",
    });
    const button = createElement("button", "", {
      width: "110px",
      height: "110px",
      borderRadius: "55px",
      border: "none",
      background:
        "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), rgba(255,88,88,0.95))",
      boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
      color: "#0a0d1f",
      fontSize: "16px",
      fontWeight: "700",
      letterSpacing: "0.3px",
      textTransform: "uppercase",
      touchAction: "manipulation",
    });
    button.textContent = "Fire";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.style.transform = "scale(0.96)";
      this.onFire && this.onFire();
    });
    const releaseButton = (event) => {
      if (event) {
        button.releasePointerCapture(event.pointerId);
      }
      button.style.transform = "scale(1)";
    };
    button.addEventListener("pointerup", releaseButton);
    button.addEventListener("pointercancel", releaseButton);
    container.appendChild(button);
    return { container, button };
  }

  updateJoystickFromEvent(event) {
    const rect = this.joystickBase.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const maxRadius = rect.width / 2;
    const normalisedX = clamp(dx / maxRadius, -1, 1);
    const normalisedY = clamp(dy / maxRadius, -1, 1);
    const thumbOffsetX = normalisedX * 45;
    const thumbOffsetY = normalisedY * 45;
    this.joystickThumb.style.transform = `translate(${thumbOffsetX - 35}px, ${thumbOffsetY - 35}px)`;
    if (this.isJoystickMode) {
      this.onAnalogInput &&
        this.onAnalogInput({ x: normalisedX, y: normalisedY });
      return;
    }
    const digitalState = {
      up: normalisedY < -0.35,
      down: normalisedY > 0.35,
      left: normalisedX < -0.35,
      right: normalisedX > 0.35,
    };
    if (
      digitalState.up !== this.lastDigitalState.up ||
      digitalState.down !== this.lastDigitalState.down ||
      digitalState.left !== this.lastDigitalState.left ||
      digitalState.right !== this.lastDigitalState.right
    ) {
      this.lastDigitalState = digitalState;
      this.onDigitalInput && this.onDigitalInput(digitalState);
    }
  }

  updateVisibility() {
    this.root.style.display = this.isVisible ? "flex" : "none";
  }

  show() {
    this.isVisible = true;
    this.updateVisibility();
  }

  hide() {
    this.isVisible = false;
    this.resetJoystickState();
    this.updateVisibility();
  }

  setJoystickMode(isEnabled) {
    const enabled = !!isEnabled;
    if (this.isJoystickMode === enabled) {
      return;
    }
    this.isJoystickMode = enabled;
    this.resetJoystickState();
  }

  resetJoystickState() {
    this.pointerId = null;
    if (this.joystickThumb) {
      this.joystickThumb.style.transform = "translate(-35px, -35px)";
    }
    this.lastDigitalState = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    if (this.isJoystickMode) {
      this.onAnalogRelease && this.onAnalogRelease();
    } else {
      this.onDigitalRelease && this.onDigitalRelease();
    }
  }
}

export default MobileControlsOverlay;
