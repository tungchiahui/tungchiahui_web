# Production secret input

Provisioning accepts one SOPS-encrypted YAML file matching
`production.sops.yaml.example`. Encrypt it to authorized production age recipients and pass its
absolute path as `tungchiahui_secret_file`. Only encrypted material may be committed.

The Ansible role decrypts on the controller with `sops`, suppresses task output, and installs
separate per-service files under `/run/tungchiahui/secrets`. The directory is runtime-only and must
be reconstructed after reboot. No `S3_CONTRACT_*` value is accepted or deployed.

`deployment-registry.env` belongs only to `deploy-agent` and contains a package-read identity for
the single approved immutable image repository. GitHub Actions publishes with its short-lived
repository token; it never receives this origin pull credential, a Docker socket, or a Host login.

Example initialization, after replacing every placeholder in a private temporary copy:

```text
sops --encrypt --age <production-age-recipient> \
  --input-type yaml --output-type yaml \
  production.plain.yaml > production.sops.yaml
```

Delete the plaintext input immediately after verifying that the encrypted file decrypts with an
authorized production age key. Never pass secret values through Ansible extra variables or Docker
build arguments.
