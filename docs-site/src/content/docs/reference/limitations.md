---
title: Known Limitations
description: Capabilities and behaviors Valkey Admin doesn't currently support.
---

This page lists the capabilities and operational caveats you should know about **before deploying** Valkey Admin. Items are grouped by category so you can scan to the area that matters for your environment.

For runtime issues and fixes, see the [Troubleshooting guide](/reference/troubleshooting/).

## Authentication & access control

- **No built-in authentication.** Valkey Admin does not provide its own login layer. Web deployments rely on an external auth proxy — for example, AWS Cognito in front of an Application Load Balancer, or a reverse proxy such as nginx or oauth2-proxy.
- **No RBAC within the app.** Any user who can reach the UI can run any command the connected Valkey ACL allows. Scope what the connecting Valkey user is permitted to do, not who can use the app.

## TLS

- **mTLS is not currently supported.** Standard TLS with password authentication, AWS ElastiCache IAM authentication, or GCP Memorystore for Valkey IAM authentication is available.

## Managed services

- **ElastiCache Serverless has limited support.** Key Browser and Send Command work. Dashboard metrics, Activity features (Hot Keys, Big Keys, Command Logs), and Monitor are unavailable because Serverless restricts the `INFO` (Memory, CPU, Stats, Clients, Keyspace sections), `MONITOR`, `COMMANDLOG`, `MEMORY USAGE`, and `CLUSTER SLOT-STATS` commands.

## Architecture

- **Metrics servers are per-primary only.** Each primary node gets its own metrics collector; replica nodes are not independently monitored.
- **Key browser loads keys in batches.** Each scan stops after approximately 1,000 keys across the cluster. Click **Load more** at the bottom of the key list to resume the scan from where it stopped and add the next batch; this also works for search results. **Scan all** keeps loading batches automatically up to a key limit you set (50,000 by default); it adds load to the server and memory use in the browser, so it only runs when you start it. The type filter applies only to the keys loaded so far.
