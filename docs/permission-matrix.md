# RBAC Permission Matrix

Roles:
- `ADMIN`
- `USER` (legacy `AUTHOR` and `ENGINEER` are treated as `USER`)
- `APPROVER`
- `REVIEWER`
- `VIEWER`

Operations:

| Permission | Admin | User | Approver | Reviewer | Viewer |
|---|---|---|---|---|---|
| `templates.read` | Yes | Yes | Yes | Yes | Yes |
| `templates.create` | Yes | Yes | No | No | No |
| `templates.update` | Yes | Yes | No | No | No |
| `templates.delete` | Yes | No | No | No | No |
| `templates.approve` | Yes | No | Yes | No | No |
| `equipment.read` | Yes | Yes | Yes | Yes | Yes |
| `equipment.write` | Yes | Yes | No | No | No |
| `units.read` | Yes | Yes | Yes | Yes | Yes |
| `units.write` | Yes | Yes | No | No | No |
| `documents.generate` | Yes | Yes | No | No | No |
| `audit.read` | Yes | No | No | No | No |
| `users.manage_roles` | Yes | No | No | No | No |
| `organizations.manage` | Yes | No | No | No | No |

Authorization enforcement:
- Server-side via `getSessionOrThrowWithPermission(...)` and `assertPermissionOrThrow(...)`.
- Denied access is logged as `authz.denied` audit event with role + permission context.
