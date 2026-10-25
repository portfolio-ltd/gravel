# Security Policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub's
[security advisories](https://github.com/portfolio-ltd/gravel/security/advisories/new)
("Report a vulnerability"). Do not open a public issue.

Include the affected version or commit, steps to reproduce, and the impact you
expect. We aim to acknowledge reports within 3 business days and to agree on a
disclosure timeline with you.

## Supported versions

Gravel is pre-1.0. Security fixes land on the default branch and in the latest
release only.

## Scope notes

- **Engineer runtimes run untrusted code.** They execute AI-written changes
  against your repositories. With `RUNTIME_MODE=docker` the API container has
  the host's Docker socket mounted, which is equivalent to root on that host.
  Run Gravel on a dedicated host/VM, or use `RUNTIME_MODE=simulated`.
- Provider keys, Git tokens and deploy configs are encrypted with
  `ENCRYPTION_KEY`; anyone holding that key and the database can read them.
- Prompt injection through task descriptions, issues or repository content is
  an inherent risk of AI engineers; human approval gates and least-privilege
  Git tokens are the primary mitigations. Reports of ways to bypass gates or
  escape org boundaries are in scope.
