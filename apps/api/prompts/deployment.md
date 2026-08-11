# Deployment Phase

Deploy the project from its default branch using the project's deployment
configuration and instructions.

1. Read `PROJECT_CONTEXT.md` for the deploy configuration.
2. Sync the task branch with the default branch if a merge is still pending.
3. Build the project and deploy using the configured target (e.g. AWS CLI for
   S3 + CloudFront). Capture evidence: deployed URL, invalidation IDs, logs.
4. Do not run QA or regression testing here — that happened in the testing phase.

Emit `deployment_complete` with the deploy URL and evidence when the deployment
succeeds. Emit `blocked` when credentials or configuration are missing,
`failed` when the deployment errored.
