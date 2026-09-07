# Production secret input

Provisioning accepts one SOPS-encrypted YAML file matching
`production.sops.yaml.example`. Encrypt it to authorized production age recipients and pass its
absolute path as `tungchiahui_secret_file`. Only encrypted material may be committed.

The Ansible role decrypts on the controller with `sops`, suppresses task output, and installs
separate per-service files under `/etc/tungchiahui/secrets`. These runtime files are persistent across
host reboot, root-owned, mode-restricted and never committed or copied into a backup artifact; the
encrypted SOPS document remains their recoverable source. No `S3_CONTRACT_*` value is accepted or
deployed.

`deployment-registry.env` belongs only to `deploy-agent` and contains a package-read identity for
the single approved immutable image repository. GitHub Actions publishes with its short-lived
repository token; it never receives this origin pull credential, a Docker socket, or a Host login.

Initialize the encrypted document and generated internal credentials without a plaintext
intermediate file:

```text
./site production secrets init
sops ops/production/secrets/production.sops.yaml
./site production secrets validate
```

The second command is only for replacing the provider-neutral AList S3, R2 off-site S3 and GHCR
placeholders. In production, copy the existing `ASSET_S3_*` AList connection values into
`BACKUP_S3_*`; the recovery engine writes only under `backups/`. Move the existing R2 values to
`BACKUP_OFFSITE_S3_*`. R2 must use a separate bucket and credentials.
Never pass secret values through Ansible extra
variables or Docker build arguments. The final command decrypts
only in controller process memory and fails closed if the document shape is wrong or any
`REPLACE_WITH_` placeholder remains; Ansible independently enforces the same placeholder gate before
installing runtime files.
