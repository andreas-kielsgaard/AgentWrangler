const grid = document.querySelector("#runtime-grid");
const summary = document.querySelector("#summary");
const refreshButton = document.querySelector("#refresh");
const connectionForm = document.querySelector("#connection-form");
const connectionList = document.querySelector("#connections");
const connectionStatus = document.querySelector("#connection-status");
const refreshConnectionsButton = document.querySelector("#refresh-connections");

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function runtimeCard({ name, id, url, reachable, health, processId }) {
  const article = element("article", "runtime-card");
  const heading = element("div", "card-heading");
  const title = element("div");
  title.append(element("p", "runtime-id", id), element("h3", null, name));
  heading.append(title, element("span", `status ${reachable ? "is-up" : "is-down"}`, reachable ? "reachable" : "unavailable"));

  const facts = element("dl");
  for (const [label, value] of [
    ["Health", health ?? "not observed"],
    ["Process", processId ?? "not observed"],
    ["Address", url],
  ]) {
    const row = element("div");
    row.append(element("dt", null, label), element("dd", null, value));
    facts.append(row);
  }
  article.append(heading, facts);
  return article;
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message ?? body.test?.error ?? `HTTP ${response.status}`);
    error.body = body;
    throw error;
  }
  return body;
}

function outputBlock(value) {
  const details = element("details", "technical-details");
  details.append(element("summary", null, "Technical details"), element("pre", null, JSON.stringify(value, null, 2)));
  return details;
}

function connectionCard(connection) {
  const article = element("article", "connection-card");
  const heading = element("div", "card-heading");
  const title = element("div");
  title.append(element("p", "runtime-id", connection.id), element("h3", null, connection.name));
  heading.append(title, element("span", `status ${connection.enabled ? "is-up" : "is-down"}`, connection.enabled ? "enabled" : "disabled"));

  const address = element("p", "connection-address", connection.baseUrl);
  const actions = element("div", "actions");
  const testButton = element("button", null, "Test without prompt");
  const toggleButton = element("button", null, connection.enabled ? "Disable" : "Enable");
  const removeButton = element("button", "danger", "Remove");
  actions.append(testButton, toggleButton, removeButton);

  const promptForm = element("form", "prompt-form");
  const promptLabel = element("label", null, "Direct development prompt");
  const prompt = element("textarea");
  prompt.name = "prompt";
  prompt.required = true;
  prompt.rows = 3;
  promptLabel.append(prompt);
  const sendButton = element("button", null, "Send through Router");
  promptForm.append(promptLabel, sendButton);
  const result = element("div", "connection-result");

  testButton.addEventListener("click", async () => {
    testButton.disabled = true;
    result.replaceChildren(element("p", null, "Testing identity, health, and capabilities without an agent invocation…"));
    try {
      const body = await jsonRequest(`/development/connections/${encodeURIComponent(connection.id)}/test`, { method: "POST", body: {} });
      const capability = body.test.observed.capabilities;
      const provider = capability.provider;
      result.replaceChildren(
        element("p", "success", `${provider.name}: ${provider.version ?? "version unavailable"}; prompt execution ${provider.promptExecution.available ? "available" : "unavailable"}.`),
        element("p", null, capability.assurance.limitations.join(" ")),
        outputBlock(body),
      );
    } catch (error) {
      result.replaceChildren(element("p", "error", error.message), error.body ? outputBlock(error.body) : element("span"));
    } finally {
      testButton.disabled = false;
    }
  });

  toggleButton.addEventListener("click", async () => {
    await jsonRequest(`/development/connections/${encodeURIComponent(connection.id)}`, {
      method: "PUT",
      body: { enabled: !connection.enabled },
    });
    await refreshConnections();
  });

  removeButton.addEventListener("click", async () => {
    await jsonRequest(`/development/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" });
    await refreshConnections();
  });

  promptForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    sendButton.disabled = true;
    result.replaceChildren(element("p", null, "Waiting for the direct node response…"));
    try {
      const body = await jsonRequest("/development/prompts", {
        method: "POST",
        body: { connectionId: connection.id, prompt: prompt.value },
      });
      result.replaceChildren(
        element("p", "success", body.output?.text ?? "The node returned no normalized message."),
        element("p", null, `Terminal outcome: ${body.terminal?.outcome ?? "unknown"}. Activity evidence: ${body.output?.activityEvidence ?? "not reported"}.`),
        outputBlock(body),
      );
    } catch (error) {
      result.replaceChildren(element("p", "error", error.message), error.body ? outputBlock(error.body) : element("span"));
    } finally {
      sendButton.disabled = false;
    }
  });

  article.append(heading, address, actions, promptForm, result);
  return article;
}

async function refreshConnections() {
  refreshConnectionsButton.disabled = true;
  connectionStatus.textContent = "Loading Ranch connections…";
  try {
    const body = await jsonRequest("/development/connections");
    connectionList.replaceChildren(...body.connections.map(connectionCard));
    connectionStatus.textContent = `${body.connections.length} connection${body.connections.length === 1 ? "" : "s"} configured.`;
  } catch (error) {
    connectionList.replaceChildren();
    connectionStatus.textContent = error.message;
  } finally {
    refreshConnectionsButton.disabled = false;
  }
}

async function refresh() {
  refreshButton.disabled = true;
  summary.textContent = "Checking runtimes…";
  try {
    const status = await jsonRequest("/scaffold/status");
    grid.replaceChildren(
      runtimeCard({
        name: status.monitor.runtime.name,
        id: status.monitor.runtime.id,
        url: status.monitor.url,
        reachable: status.monitor.reachable,
        health: "ok",
        processId: "this process",
      }),
      ...status.runtimes.map((entry) => runtimeCard({
        name: entry.target.name,
        id: entry.target.id,
        url: entry.target.url,
        reachable: entry.reachable,
        health: entry.observed?.health,
        processId: entry.observed?.processId,
      })),
    );
    const reachableCount = status.runtimes.filter((entry) => entry.reachable).length + 1;
    summary.textContent = `${reachableCount} of ${status.runtimes.length + 1} monitored runtimes reachable · observed ${new Date(status.observedAt).toLocaleTimeString()}`;
  } catch (error) {
    summary.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
  }
}

connectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(connectionForm);
  connectionStatus.textContent = "Saving connection…";
  try {
    await jsonRequest("/development/connections", {
      method: "POST",
      body: { name: data.get("name"), baseUrl: data.get("baseUrl") },
    });
    await refreshConnections();
  } catch (error) {
    connectionStatus.textContent = error.message;
  }
});

refreshButton.addEventListener("click", refresh);
refreshConnectionsButton.addEventListener("click", refreshConnections);
refresh();
refreshConnections();
setInterval(refresh, 5_000);
