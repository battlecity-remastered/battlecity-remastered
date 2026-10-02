const createHeader = () => {
    const header = document.createElement("div");
    header.className = "lobby-header";

    const title = document.createElement("h2");
    title.className = "lobby-title";
    title.textContent = "City Lobby";

    const subtitle = document.createElement("p");
    subtitle.className = "lobby-subtitle";
    subtitle.textContent = "Choose a city to join as mayor or recruit.";

    header.appendChild(title);
    header.appendChild(subtitle);

    return { header, subtitle };
};

const createTabs = () => {
    const tabs = document.createElement("div");
    tabs.className = "lobby-tabs";

    const citiesTab = document.createElement("button");
    citiesTab.type = "button";
    citiesTab.className = "lobby-tab";
    citiesTab.textContent = "Lobby";

    const scoresTab = document.createElement("button");
    scoresTab.type = "button";
    scoresTab.className = "lobby-tab";
    scoresTab.textContent = "High Scores";

    tabs.appendChild(citiesTab);
    tabs.appendChild(scoresTab);

    return { tabs, citiesTab, scoresTab };
};

const createPanels = () => {
    const tabPanels = document.createElement("div");
    tabPanels.className = "lobby-tab-panels";

    const cityPanel = document.createElement("div");
    cityPanel.className = "lobby-tab-panel";

    const cityFilterWrap = document.createElement("div");
    cityFilterWrap.className = "lobby-city-filter";

    const cityFilterInput = document.createElement("input");
    cityFilterInput.type = "search";
    cityFilterInput.className = "lobby-city-filter-input";
    cityFilterInput.placeholder = "Filter cities by name...";

    cityFilterWrap.appendChild(cityFilterInput);

    const cityList = document.createElement("div");
    cityList.className = "lobby-city-list";

    cityPanel.appendChild(cityFilterWrap);
    cityPanel.appendChild(cityList);

    const scorePanel = document.createElement("div");
    scorePanel.className = "lobby-tab-panel";

    const scoreList = document.createElement("div");
    scoreList.className = "lobby-highscore-list";
    scorePanel.appendChild(scoreList);

    tabPanels.appendChild(cityPanel);
    tabPanels.appendChild(scorePanel);

    return { tabPanels, cityPanel, scorePanel, cityFilterInput, cityList, scoreList };
};

const createActions = () => {
    const actions = document.createElement("div");
    actions.className = "lobby-actions";

    const actionGroup = document.createElement("div");
    actionGroup.className = "lobby-action-group";

    const autoButton = document.createElement("button");
    autoButton.type = "button";
    autoButton.className = "lobby-btn";
    autoButton.textContent = "Auto Assign";

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "lobby-btn";
    refreshButton.textContent = "Refresh";

    actionGroup.appendChild(autoButton);
    actionGroup.appendChild(refreshButton);
    actions.appendChild(actionGroup);

    const statusNode = document.createElement("div");
    statusNode.className = "lobby-status";
    statusNode.dataset.type = "info";
    statusNode.textContent = "Connected. Choose a city to enter.";

    return { actions, autoButton, refreshButton, statusNode };
};

export const createLobbyLayout = (root: HTMLElement) => {
    const overlay = document.createElement("div");
    overlay.className = "lobby-overlay-ts";
    const panel = document.createElement("div");
    panel.setAttribute("data-ui", "lobby");
    panel.className = "lobby-panel-ts";

    const { header, subtitle } = createHeader();
    const { tabs, citiesTab, scoresTab } = createTabs();
    const { tabPanels, cityPanel, scorePanel, cityFilterInput, cityList, scoreList } = createPanels();
    const { actions, autoButton, refreshButton, statusNode } = createActions();
    panel.appendChild(header);
    panel.appendChild(tabs);
    panel.appendChild(tabPanels);
    panel.appendChild(actions);
    panel.appendChild(statusNode);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    return { overlay, subtitle, citiesTab, scoresTab, cityPanel, scorePanel, cityFilterInput, cityList, scoreList, autoButton, refreshButton, statusNode };
};
