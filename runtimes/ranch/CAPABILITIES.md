# Wrangle Ranch capabilities

Ranch currently demonstrates:

- independent start, identity, and health;
- thin list, create, update, and delete forwarding to the Durable Data Server;
- rejection of responses from a server with an unexpected configured identifier;
- fetching one current connection and observing Execution Node identity, health, and capabilities without sending a prompt;
- a clear unavailable response when the server-dependent operation cannot run.

Implementation: `server.mjs`. Happy-flow and dependency tests: `tests/execution-node-connections.test.mjs` and `tests/runtime-management.test.mjs`.

Ranch owns no canonical connection file, server-domain validation, Router publication, retry, acknowledgement, cache, or offline continuation. HTTP paths and JSON shapes are temporary.
