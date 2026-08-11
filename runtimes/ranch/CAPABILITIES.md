# Wrangle Ranch capabilities

Ranch currently demonstrates:

- terminal-visible request, cross-runtime call, link, and connection-test activity;
- independent start, identity, and health;
- machine-readable capability advertisement;
- explicit session-local configuration and testing of its Durable Data Server link;
- thin list, create, update, and delete forwarding to the Durable Data Server;
- rejection of responses from a server with an unexpected configured identifier;
- fetching one current connection and observing Execution Node identity, health, and capabilities without sending a prompt;
- a clear unavailable response when the server-dependent operation cannot run.

Implementation: `server.mjs`. Happy-flow and dependency tests: `tests/execution-node-connections.test.mjs` and `tests/runtime-management.test.mjs`.

Ranch starts without a default Durable Data Server link. It owns no canonical connection file, Router publication, retry, acknowledgement, cache, or offline continuation. HTTP paths and JSON shapes are temporary.
