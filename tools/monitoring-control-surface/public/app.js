const state = {
  surface: null,
  discovered: [],
  scenario: "runtime-operator",
  contexts: {},
  selectedOperator: "ranch",
};

const monitorView = document.querySelector("#monitor-view");
const controlView = document.querySelector("#control-view");
const runtimeList = document.querySelector("#runtime-list");
const scanStatus = document.querySelector("#scan-status");
const scenarioWorkspace = document.querySelector("#scenario-workspace");
const runtimeDialog = document.querySelector("#runtime-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogBody = document.querySelector("#dialog-body");

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? `HTTP ${response.status}`);
  return body;
}

function optionMarkup(entries, placeholder = "Select a discovered runtime") {
  return `<option value="">${placeholder}</option>${entries.map((entry) => (
    `<option value="${entry.baseUrl}">${entry.name} — ${entry.baseUrl}</option>`
  )).join("")}`;
}

function setResult(element, value, error = false) {
  element.classList.toggle("danger", error);
  element.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

async function loadContext(scenario) {
  const body = await api(`/api/scenarios/${scenario}/context`);
  state.contexts[scenario] = body.context;
  return body.context;
}

async function refreshDiscovery() {
  const body = await api("/api/discovery");
  state.discovered = body.runtimes;
  renderMonitor();
}

function renderMonitor() {
  if (!state.discovered.length) {
    runtimeList.innerHTML = `<div class="panel muted">No Agent Wrangler runtimes discovered.</div>`;
    return;
  }
  runtimeList.replaceChildren(...state.discovered.map((runtime) => {
    const row = document.createElement("article");
    row.className = "runtime-row";
    const identity = document.createElement("div");
    identity.innerHTML = `<span class="pill">${runtime.owner}</span><h3>${runtime.name}</h3>`;
    const location = document.createElement("div");
    location.innerHTML = `<p>${runtime.baseUrl}</p><p>PID ${runtime.processId ?? "not advertised"}</p>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Inspect through CLI";
    button.addEventListener("click", () => inspectRuntime(runtime));
    row.append(identity, location, button);
    return row;
  }));
}

async function inspectRuntime(runtime) {
  dialogTitle.textContent = runtime.name;
  dialogBody.innerHTML = `<p class="muted">Running runtime-specific CLI inspection…</p>`;
  runtimeDialog.showModal();
  try {
    const body = await api("/api/discovery/inspect", { method: "POST", body: { owner: runtime.owner, baseUrl: runtime.baseUrl } });
    const status = body.inspection.status;
    const capabilities = body.inspection.capabilities;
    dialogBody.innerHTML = `
      <dl class="details-grid">
        <dt>Runtime</dt><dd>${runtime.runtimeId}</dd>
        <dt>Endpoint</dt><dd>${runtime.baseUrl}</dd>
        <dt>Status</dt><dd>${status?.status ?? "unknown"}</dd>
        <dt>Process</dt><dd>${status?.identity?.processId ?? runtime.processId ?? "not advertised"}</dd>
        <dt>Started</dt><dd>${status?.identity?.startedAt ?? runtime.startedAt ?? "not advertised"}</dd>
        <dt>Operations</dt><dd>${(capabilities?.operations ?? []).join("<br>") || "None advertised"}</dd>
        <dt>Dependencies</dt><dd>${(capabilities?.dependencies ?? []).map((item) => `${item.id}: ${item.configured ? "configured" : "not configured"}`).join("<br>") || "None"}</dd>
      </dl>
      <h3>CLI commands</h3>
      <div class="command-list">${body.inspection.commands.join("<br>")}</div>`;
  } catch (error) {
    dialogBody.innerHTML = `<p class="danger">${error.message}</p>`;
  }
}

function operatorMarkup(context) {
  const runtime = state.surface.runtimes.find((entry) => entry.owner === state.selectedOperator);
  const owned = new Set(context.ownedRuntimeTypes);
  const matching = state.discovered.filter((entry) => entry.owner === state.selectedOperator);
  return `
    <div class="actor-callout"><strong>Actor:</strong> an operator controlling local runtime processes. Package ownership is claimed explicitly; the terminal shows only processes launched here.</div>
    <section class="panel">
      <h3>Claimed runtime ownership</h3>
      <div class="claim-grid">${state.surface.runtimes.map((entry) => `
        <label><input type="checkbox" data-owner-claim="${entry.owner}" ${owned.has(entry.owner) ? "checked" : ""}> ${entry.name}</label>
      `).join("")}</div>
      <p><button id="save-operator-context" type="button">Apply ownership claims</button></p>
    </section>
    <div class="runtime-tabs" role="tablist">${state.surface.runtimes.map((entry) => `
      <button type="button" role="tab" data-runtime-tab="${entry.owner}" class="${entry.owner === state.selectedOperator ? "active" : ""}">${entry.owner}</button>
    `).join("")}</div>
    <div class="operator-grid">
      <section class="panel">
        <span class="pill">${owned.has(runtime.owner) ? "claimed owned" : "not owned"}</span>
        <h3>${runtime.name}</h3>
        <div class="inline-actions">
          <button type="button" data-process-action="start" ${owned.has(runtime.owner) ? "" : "disabled"}>Launch</button>
          <button type="button" data-process-action="stop" ${owned.has(runtime.owner) ? "" : "disabled"}>Stop</button>
          <button type="button" data-process-action="restart" ${owned.has(runtime.owner) ? "" : "disabled"}>Restart</button>
        </div>
        <h3>Discovered instance</h3>
        <div class="inline-actions">
          <label>Endpoint<select id="operator-inspect-endpoint">${optionMarkup(matching)}</select></label>
          <button id="operator-inspect" type="button" ${matching.length ? "" : "disabled"}>Inspect</button>
        </div>
        <p id="operator-process-status" class="status-line"></p>
      </section>
      <section class="panel">
        <h3>Owned process terminal</h3>
        <pre id="operator-terminal" class="terminal">No process output.</pre>
      </section>
    </div>`;
}

async function renderOperator() {
  const context = state.contexts["runtime-operator"] ?? await loadContext("runtime-operator");
  scenarioWorkspace.innerHTML = operatorMarkup(context);
  document.querySelectorAll("[data-runtime-tab]").forEach((button) => button.addEventListener("click", () => {
    state.selectedOperator = button.dataset.runtimeTab;
    renderOperator();
  }));
  document.querySelector("#save-operator-context").addEventListener("click", async () => {
    const ownedRuntimeTypes = [...document.querySelectorAll("[data-owner-claim]:checked")].map((input) => input.dataset.ownerClaim);
    const body = await api("/api/scenarios/runtime-operator/context", { method: "PUT", body: { ownedRuntimeTypes } });
    state.contexts["runtime-operator"] = body.context;
    renderOperator();
  });
  document.querySelectorAll("[data-process-action]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api(`/api/operator/processes/${state.selectedOperator}/${button.dataset.processAction}`, { method: "POST" });
    } catch (error) {
      document.querySelector("#operator-process-status").textContent = error.message;
    }
    await refreshOperatorProcess();
  }));
  document.querySelector("#operator-inspect").addEventListener("click", () => {
    const baseUrl = document.querySelector("#operator-inspect-endpoint").value;
    const runtime = state.discovered.find((entry) => entry.baseUrl === baseUrl);
    if (runtime) inspectRuntime(runtime);
  });
  await refreshOperatorProcess();
}

async function refreshOperatorProcess() {
  if (state.scenario !== "runtime-operator" || controlView.classList.contains("active") === false) return;
  const statusElement = document.querySelector("#operator-process-status");
  const terminal = document.querySelector("#operator-terminal");
  if (!statusElement || !terminal) return;
  try {
    const body = await api(`/api/operator/processes/${state.selectedOperator}`);
    statusElement.textContent = `${body.process.status}${body.process.processId ? ` · PID ${body.process.processId}` : ""}`;
    terminal.textContent = body.process.output.length ? body.process.output.join("\n") : "No process output.";
    terminal.scrollTop = terminal.scrollHeight;
  } catch (error) {
    statusElement.textContent = error.message;
  }
}

function administratorMarkup(context) {
  const owned = new Set(context.ownedEndpoints);
  const known = new Set(context.knownEndpoints);
  const farms = state.discovered.filter((entry) => entry.owner === "farm");
  const durable = state.discovered.filter((entry) => entry.owner === "durable-data" && known.has(entry.baseUrl));
  const farmReady = Boolean(context.operatingFarm && owned.has(context.operatingFarm));
  return `
    <div class="actor-callout"><strong>Actor:</strong> a collection administrator operating through an explicitly owned Farm. Every downstream endpoint must be selected as known; operations then cross the network through Farm.</div>
    <section class="panel">
      <h3>Actor context</h3>
      <div class="claim-grid">${state.discovered.length ? state.discovered.map((entry) => `
        <div class="claim-row">
          <span>${entry.name}<small>${entry.baseUrl}</small></span>
          <label><input type="checkbox" data-admin-owned="${entry.baseUrl}" ${owned.has(entry.baseUrl) ? "checked" : ""}> Owned</label>
          <label><input type="checkbox" data-admin-known="${entry.baseUrl}" ${known.has(entry.baseUrl) ? "checked" : ""}> Known</label>
        </div>`).join("") : `<p class="muted">Scan runtimes before defining actor context.</p>`}</div>
      <div class="inline-actions">
        <label>Operating Farm<select id="admin-farm">${optionMarkup(farms)}</select></label>
        <button id="save-admin-context" type="button">Apply actor claims</button>
      </div>
    </section>
    <section class="panel">
      <h3>1. Connect Farm to Durable Data</h3>
      <div class="inline-actions">
        <label>Known Durable Data<select id="admin-durable">${optionMarkup(durable, "Select a known Durable Data endpoint")}</select></label>
        <button id="connect-durable" type="button" ${farmReady && durable.length ? "" : "disabled"}>Connect through Farm</button>
      </div>
    </section>
    <section class="panel">
      <h3>2. Register collection runtimes</h3>
      <div class="registration-list">${["ranch", "router", "gallery", "engine"].map((owner) => {
        const choices = state.discovered.filter((entry) => entry.owner === owner && known.has(entry.baseUrl));
        return `<div class="registration-row"><strong>${owner}</strong><label>Known endpoint<select data-register-select="${owner}">${optionMarkup(choices)}</select></label><button type="button" data-register-runtime="${owner}" ${farmReady && choices.length ? "" : "disabled"}>Register</button></div>`;
      }).join("")}</div>
    </section>
    <section class="panel">
      <div class="inline-actions"><h3>3. Read directory through Farm</h3><button id="list-directory" type="button" ${farmReady ? "" : "disabled"}>List registered runtimes</button></div>
      <pre id="admin-result" class="result">No administrator operation performed.</pre>
    </section>`;
}

async function renderAdministrator() {
  const context = state.contexts["collection-administrator"] ?? await loadContext("collection-administrator");
  scenarioWorkspace.innerHTML = administratorMarkup(context);
  const farmSelect = document.querySelector("#admin-farm");
  farmSelect.value = context.operatingFarm ?? "";
  document.querySelector("#save-admin-context").addEventListener("click", async () => {
    const ownedEndpoints = [...document.querySelectorAll("[data-admin-owned]:checked")].map((input) => input.dataset.adminOwned);
    const knownEndpoints = [...document.querySelectorAll("[data-admin-known]:checked")].map((input) => input.dataset.adminKnown);
    try {
      const body = await api("/api/scenarios/collection-administrator/context", {
        method: "PUT",
        body: { ownedEndpoints, knownEndpoints, operatingFarm: farmSelect.value || null },
      });
      state.contexts["collection-administrator"] = body.context;
      renderAdministrator();
    } catch (error) {
      setResult(document.querySelector("#admin-result"), error.message, true);
    }
  });

  async function runAdministrator(path, body) {
    const result = document.querySelector("#admin-result");
    setResult(result, "Running…");
    try {
      setResult(result, await api(path, { method: "POST", body }));
    } catch (error) {
      setResult(result, error.message, true);
    }
  }

  document.querySelector("#connect-durable").addEventListener("click", () => runAdministrator(
    "/api/scenarios/collection-administrator/connect-durable-data",
    { farmUrl: context.operatingFarm, durableDataUrl: document.querySelector("#admin-durable").value },
  ));
  document.querySelectorAll("[data-register-runtime]").forEach((button) => button.addEventListener("click", () => {
    const runtimeId = button.dataset.registerRuntime;
    runAdministrator("/api/scenarios/collection-administrator/register-runtime", {
      farmUrl: context.operatingFarm,
      runtimeId,
      runtimeUrl: document.querySelector(`[data-register-select="${runtimeId}"]`).value,
    });
  }));
  document.querySelector("#list-directory").addEventListener("click", () => runAdministrator(
    "/api/scenarios/collection-administrator/runtime-directory",
    { farmUrl: context.operatingFarm },
  ));
}

async function renderScenario() {
  if (state.scenario === "runtime-operator") await renderOperator();
  else await renderAdministrator();
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("[data-view]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  monitorView.classList.toggle("active", button.dataset.view === "monitor");
  controlView.classList.toggle("active", button.dataset.view === "control");
  if (button.dataset.view === "control") renderScenario();
}));

document.querySelector("#scan-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  scanStatus.textContent = "Scanning configured Agent Wrangler ports…";
  try {
    const hosts = document.querySelector("#scan-hosts").value.split(",").map((value) => value.trim()).filter(Boolean);
    const body = await api("/api/discovery/scan", { method: "POST", body: { hosts } });
    state.discovered = body.runtimes;
    scanStatus.textContent = `${body.runtimes.length} runtime instance${body.runtimes.length === 1 ? "" : "s"} discovered at ${new Date(body.observedAt).toLocaleTimeString()}.`;
    renderMonitor();
    if (controlView.classList.contains("active")) renderScenario();
  } catch (error) {
    scanStatus.textContent = error.message;
  }
});

document.querySelector("#scenario-select").addEventListener("change", async (event) => {
  state.scenario = event.target.value;
  await renderScenario();
});
document.querySelector("#dialog-close").addEventListener("click", () => runtimeDialog.close());

state.surface = await api("/api/surface");
await Promise.all([refreshDiscovery(), loadContext("runtime-operator"), loadContext("collection-administrator")]);
renderMonitor();
setInterval(refreshOperatorProcess, 1_000);
