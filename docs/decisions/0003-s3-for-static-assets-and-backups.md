# ADR 0003：S3 用于 Static Asset 与 Backup Artifact

- Status: Accepted
- Date: 2026-08-23

## Context

Object Storage 非常适合 Image、Attachment、Music、Static Library 和大型 Backup Object，但 Runtime Article Data 现在属于 PostgreSQL。

## Decision

使用 AList S3 保存网站 Static/Binary Asset 和 Backup Artifact。使用 Cloudflare R2 作为独立 Off-site Replica。不要在 S3 中保存 Canonical Article Markdown。

## Consequences

S3 Layer 简单且可替换。Static Asset 保持 CDN-friendly，而 Structured Content/Search/Translation Logic 留在 PostgreSQL。
