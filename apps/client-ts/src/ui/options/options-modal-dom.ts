export type OptionsModalDom = {
    overlay: HTMLDivElement;
    badge: HTMLSpanElement;
    closeButton: HTMLButtonElement;
    sectionHeader: HTMLButtonElement;
    sectionBody: HTMLDivElement;
    revealButton: HTMLButtonElement;
    formSection: HTMLDivElement;
    textArea: HTMLTextAreaElement;
    helper: HTMLDivElement;
    loadButton: HTMLButtonElement;
    status: HTMLDivElement;
    summary: HTMLPreElement;
};

type OptionsHeaderDom = {
    header: HTMLDivElement;
    badge: HTMLSpanElement;
    closeButton: HTMLButtonElement;
};

type OptionsSectionDom = {
    section: HTMLDivElement;
    sectionHeader: HTMLButtonElement;
    sectionBody: HTMLDivElement;
    revealButton: HTMLButtonElement;
    formSection: HTMLDivElement;
    textArea: HTMLTextAreaElement;
    helper: HTMLDivElement;
    loadButton: HTMLButtonElement;
    status: HTMLDivElement;
    summary: HTMLPreElement;
};

export const setOptionsSectionOpen = (dom: OptionsModalDom, isOpen: boolean): void => {
    dom.sectionBody.dataset.open = isOpen ? "true" : "false";
    dom.sectionHeader.setAttribute("aria-expanded", isOpen ? "true" : "false");
};

export const setOptionsFormOpen = (dom: OptionsModalDom, isOpen: boolean): void => {
    if (isOpen) {
        setOptionsSectionOpen(dom, true);
    }
    dom.formSection.dataset.open = isOpen ? "true" : "false";
    dom.revealButton.disabled = isOpen;
    dom.revealButton.style.opacity = isOpen ? "0.7" : "1";
    if (isOpen) {
        dom.textArea.focus();
    }
};

export const setOptionsStatus = (dom: OptionsModalDom, message: string): void => {
    dom.status.textContent = message;
};

const createOptionsHeader = (): OptionsHeaderDom => {
    const header = document.createElement("div");
    header.className = "battlecity-options-header";

    const title = document.createElement("h2");
    title.className = "battlecity-options-title";
    title.textContent = "Options";

    const badge = document.createElement("span");
    badge.className = "battlecity-options-badge";
    badge.textContent = "City Import";

    const closeButton = document.createElement("button");
    closeButton.className = "battlecity-options-close";
    closeButton.type = "button";
    closeButton.textContent = "Close";

    title.appendChild(badge);
    header.appendChild(title);
    header.appendChild(closeButton);
    return { header, badge, closeButton };
};

const createOptionsSectionHeader = (): HTMLButtonElement => {
    const sectionHeader = document.createElement("button");
    sectionHeader.className = "battlecity-options-sectionHeader";
    sectionHeader.type = "button";
    sectionHeader.setAttribute("aria-expanded", "true");

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "battlecity-options-sectionTitle";
    sectionTitle.innerHTML = "<span>City import</span><span class=\"battlecity-options-sectionSubtitle\">Replace your city layout from a builder export</span>";

    const chevron = document.createElement("span");
    chevron.className = "battlecity-options-chevron";
    chevron.innerHTML = "&#9662;";

    sectionHeader.appendChild(sectionTitle);
    sectionHeader.appendChild(chevron);
    return sectionHeader;
};

const createOptionsSectionBodyFrame = (): {
    sectionBody: HTMLDivElement;
    revealButton: HTMLButtonElement;
} => {
    const sectionBody = document.createElement("div");
    sectionBody.className = "battlecity-options-sectionBody";
    sectionBody.dataset.open = "true";

    const lead = document.createElement("p");
    lead.className = "battlecity-options-lead";
    lead.textContent = "Import a city layout for the selected city slot. This mirrors the legacy options panel flow while keeping TypeScript parity import controls.";

    const steps = document.createElement("ul");
    steps.className = "battlecity-options-steps";
    [
        "Pick your city slot with , and . keys.",
        "Press Paste JSON to reveal import controls.",
        "Click Load Map to import the selected slot asset."
    ].forEach((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        steps.appendChild(item);
    });

    const actionsRow = document.createElement("div");
    actionsRow.className = "battlecity-options-actions";

    const revealButton = document.createElement("button");
    revealButton.className = "battlecity-options-reveal";
    revealButton.type = "button";
    revealButton.textContent = "Paste JSON";
    actionsRow.appendChild(revealButton);

    sectionBody.appendChild(lead);
    sectionBody.appendChild(steps);
    sectionBody.appendChild(actionsRow);

    return { sectionBody, revealButton };
};

const createOptionsImportForm = (): {
    formSection: HTMLDivElement;
    textArea: HTMLTextAreaElement;
    helper: HTMLDivElement;
    loadButton: HTMLButtonElement;
    status: HTMLDivElement;
} => {
    const formSection = document.createElement("div");
    formSection.className = "battlecity-options-form";
    formSection.dataset.open = "false";

    const textArea = document.createElement("textarea");
    textArea.className = "battlecity-options-textarea";
    textArea.placeholder = "{ \"layout\": [...], \"defenses\": [...] }";

    const helper = document.createElement("div");
    helper.className = "battlecity-options-helper";

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.justifyContent = "flex-end";

    const loadButton = document.createElement("button");
    loadButton.className = "battlecity-options-action";
    loadButton.type = "button";
    loadButton.textContent = "Load Map";
    actionRow.appendChild(loadButton);

    const status = document.createElement("div");
    status.className = "battlecity-options-status";

    formSection.appendChild(textArea);
    formSection.appendChild(helper);
    formSection.appendChild(actionRow);
    formSection.appendChild(status);

    return { formSection, textArea, helper, loadButton, status };
};

const createOptionsSectionBody = (): OptionsSectionDom => {
    const sectionHeader = createOptionsSectionHeader();
    const { sectionBody, revealButton } = createOptionsSectionBodyFrame();
    const { formSection, textArea, helper, loadButton, status } = createOptionsImportForm();
    const summary = document.createElement("pre");
    summary.className = "battlecity-options-summary";

    sectionBody.appendChild(formSection);
    sectionBody.appendChild(summary);

    const section = document.createElement("div");
    section.className = "battlecity-options-section";
    section.appendChild(sectionHeader);
    section.appendChild(sectionBody);

    return {
        section,
        sectionHeader,
        sectionBody,
        revealButton,
        formSection,
        textArea,
        helper,
        loadButton,
        status,
        summary
    };
};

export const createOptionsModalDom = (root: HTMLElement): OptionsModalDom => {
    const overlay = document.createElement("div");
    overlay.className = "battlecity-options-overlay";
    overlay.setAttribute("data-ui", "options-modal");

    const panel = document.createElement("div");
    panel.className = "battlecity-options-panel";

    const body = document.createElement("div");
    body.className = "battlecity-options-body";

    const header = createOptionsHeader();
    const section = createOptionsSectionBody();

    body.appendChild(section.section);
    panel.appendChild(header.header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    return {
        overlay,
        badge: header.badge,
        closeButton: header.closeButton,
        sectionHeader: section.sectionHeader,
        sectionBody: section.sectionBody,
        revealButton: section.revealButton,
        formSection: section.formSection,
        textArea: section.textArea,
        helper: section.helper,
        loadButton: section.loadButton,
        status: section.status,
        summary: section.summary
    };
};
