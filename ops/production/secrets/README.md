# Production env input

Production now uses one host-local plaintext env file as the runtime secret source of truth:

```text
/etc/tungchiahui/.env
```

The real file is created outside this repository, owned by `root:root`, and mode `0600`. It is not
stored in GitHub Actions, not copied into images, and not served from any public directory.

Use `./site production secrets init --output /etc/tungchiahui/.env` on an authorized host to create
a fresh file, then replace every `REPLACE_WITH_` value and run:

```bash
./site production secrets validate --env-file /etc/tungchiahui/.env
```

For the one-time ADR 0022 migration from the retired encrypted SOPS document, run the conversion on
an authorized machine that already has SOPS/age access:

```bash
pnpm exec tsx tools/production/convert-legacy-sops-to-env.ts \
  --input /path/to/production.sops.yaml \
  --output /tmp/tungchiahui-production.env
```

Review the generated file locally, install it on the production host as `/etc/tungchiahui/.env`, then
set `root:root` ownership and `0600` permissions before validating it. The converter updates the
deployment OIDC policy from `deploy.yml` to `release.yml` and base64-encodes the legacy PgBouncer and
backup age file-shaped secrets.

`PGBOUNCER_USERLIST_BASE64` and `BACKUP_AGE_IDENTITY_BASE64` are base64-encoded because PgBouncer
and age need file-shaped inputs. The Ansible role decodes those two values into restricted derived
runtime files under `/etc/tungchiahui/secrets`; the `.env` remains the only manually managed secret
file.

`deploy-agent` uses the production env keys injected into its own process by Docker Compose. After
editing `/etc/tungchiahui/.env`, run the approved provisioning/reconcile path to restart only the
affected services before relying on the new values in a deployment.
