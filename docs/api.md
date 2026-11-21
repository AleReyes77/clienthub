# API reference

Base URL: `/api/v1`. All bodies are JSON. Authentication uses the session cookie set by
`/auth/login` or `/auth/register`. State-changing requests must come from the web app's origin
(see [ADR 0003](adr/0003-csrf-protection.md)).

## Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid",
    "details": [{ "path": "email", "message": "Enter a valid email address" }]
  }
}
```

| Status | Meaning                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | Invalid input (`VALIDATION_ERROR`, `INVALID_JSON`, `INVALID_CLIENT`, `INVALID_ASSIGNEE`, `INVALID_TOKEN`, `INVALID_UPLOAD`, `EMPTY_FILE`) |
| 401    | No valid session (`UNAUTHORIZED`) or wrong credentials (`INVALID_CREDENTIALS`)                                                            |
| 403    | Not allowed (`FORBIDDEN`, `CSRF_ORIGIN_MISMATCH`, `INVITATION_EMAIL_MISMATCH`, `EMAIL_NOT_VERIFIED`)                                      |
| 404    | Not found **or not visible to you** (`NOT_FOUND`)                                                                                         |
| 409    | Conflict (`EMAIL_TAKEN`, `ALREADY_MEMBER`)                                                                                                |
| 410    | Invitation used or expired                                                                                                                |
| 413    | File too large (`FILE_TOO_LARGE`)                                                                                                         |
| 415    | File type not allowed (`UNSUPPORTED_FILE_TYPE`)                                                                                           |
| 429    | Too many requests (`RATE_LIMITED`)                                                                                                        |

## Auth

| Method | Path                        | Body                        | Response                                  |
| ------ | --------------------------- | --------------------------- | ----------------------------------------- |
| POST   | `/auth/register`            | `{ name, email, password }` | `201 { user }` + session cookie           |
| POST   | `/auth/login`               | `{ email, password }`       | `200 { user }` + session cookie           |
| POST   | `/auth/logout`              | none                        | `204`                                     |
| GET    | `/auth/me`                  | none                        | `200 { user }` (includes `emailVerified`) |
| POST   | `/auth/verify-email`        | `{ token }`                 | `204`                                     |
| POST   | `/auth/resend-verification` | none (logged in)            | `204`                                     |
| POST   | `/auth/forgot-password`     | `{ email }`                 | `202` (always, see below)                 |
| POST   | `/auth/reset-password`      | `{ token, password }`       | `204`, closes every session               |

`/auth/forgot-password` answers the same way whether or not the email has an account.
Tokens come from the links in the emails (`/verify-email#token=…`, `/reset-password#token=…`).

## Organizations and invitations

| Method | Path                         | Permission    | Response                                    |
| ------ | ---------------------------- | ------------- | ------------------------------------------- |
| GET    | `/orgs`                      | logged in     | `{ organizations }` (with your role)        |
| POST   | `/orgs` `{ name }`           | logged in     | `201 { organization }` (you become `OWNER`) |
| GET    | `/orgs/:orgId`               | member        | `{ organization }`                          |
| GET    | `/invitations/:token`        | public        | `{ invitation }` preview                    |
| POST   | `/invitations/:token/accept` | invited email | `{ organization }`                          |

## Members (under `/orgs/:orgId`)

| Method | Path                                | Permission       | Response                                   |
| ------ | ----------------------------------- | ---------------- | ------------------------------------------ |
| GET    | `/members`                          | `members:read`   | `{ members }`                              |
| PATCH  | `/members/:membershipId` `{ role }` | `members:manage` | `204`                                      |
| DELETE | `/members/:membershipId`            | `members:manage` | `204`                                      |
| GET    | `/invitations`                      | `members:manage` | `{ invitations }` (pending)                |
| POST   | `/invitations` `{ email, role }`    | `members:manage` | `201 { invitation }` with one-time `token` |
| DELETE | `/invitations/:invitationId`        | `members:manage` | `204`                                      |

## Projects (under `/orgs/:orgId`)

| Method | Path                                                      | Permission                               | Response          |
| ------ | --------------------------------------------------------- | ---------------------------------------- | ----------------- |
| GET    | `/projects`                                               | member (clients see only their projects) | `{ projects }`    |
| POST   | `/projects` `{ name, description?, clientMembershipId? }` | `projects:create`                        | `201 { project }` |
| GET    | `/projects/:projectId`                                    | can see project                          | `{ project }`     |
| PATCH  | `/projects/:projectId`                                    | `projects:update`                        | `{ project }`     |
| DELETE | `/projects/:projectId`                                    | `projects:delete`                        | `204`             |

## Tasks (under `/orgs/:orgId/projects/:projectId`)

| Method | Path                                                                | Permission      | Response       |
| ------ | ------------------------------------------------------------------- | --------------- | -------------- |
| GET    | `/tasks`                                                            | can see project | `{ tasks }`    |
| POST   | `/tasks` `{ title, description?, assigneeMembershipId?, dueDate? }` | `tasks:create`  | `201 { task }` |
| PATCH  | `/tasks/:taskId`                                                    | `tasks:update`  | `{ task }`     |
| DELETE | `/tasks/:taskId`                                                    | `tasks:delete`  | `204`          |

`dueDate` uses the format `YYYY-MM-DD`.

## Files (under `/orgs/:orgId/projects/:projectId`)

| Method | Path                               | Permission                       | Response                    |
| ------ | ---------------------------------- | -------------------------------- | --------------------------- |
| GET    | `/files`                           | can see project                  | `{ files }`                 |
| POST   | `/files` (multipart, field `file`) | `files:upload` + can see project | `201 { file }`              |
| GET    | `/files/:fileId/download`          | can see project                  | file bytes as an attachment |
| DELETE | `/files/:fileId`                   | uploader, or `files:deleteAny`   | `204`                       |

Allowed types: PNG, JPEG, WebP, GIF, PDF, ZIP, DOCX, XLSX, PPTX, TXT, CSV, Markdown (max 10 MB).

## Audit log (under `/orgs/:orgId`)

| Method | Path                  | Permission   | Response                                             |
| ------ | --------------------- | ------------ | ---------------------------------------------------- |
| GET    | `/audit-logs?cursor=` | `audit:read` | `{ entries, nextCursor }`, 50 per page, newest first |

## Health

`GET /health` (outside `/api/v1`) returns `{ "status": "ok" }` when the API can reach the database.
