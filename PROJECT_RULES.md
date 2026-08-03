# PROJECT_RULES.md

## Purpose

This project is an internal office management portal running in Docker containers.

## Technology Stack

- Frontend: React
- Backend: Node.js (Express)
- Database: PostgreSQL
- Containerization: Docker & Docker Compose

## Core Rules

1. Never generate placeholder logic.
2. Never generate fake APIs.
3. Always maintain production-grade structure.
4. Follow modular architecture.
5. Maintain strict separation between frontend, backend, and database.
6. All modules must support CRUD permissions.
7. Every database table must include:
   - id
   - created_at
   - updated_at
   - created_by
   - updated_by
   - status

8. Use soft delete instead of permanent delete unless specified.
9. Maintain audit logging for important actions.
10. Use environment variables for secrets and configuration.
11. Avoid duplicate business logic.
12. All code must be scalable and maintainable.
13. All APIs must return standardized JSON responses.
14. Follow RESTful API design.
15. Never break existing module functionality while modifying code.
16. Maintain responsive UI design.
17. Every module must support search, filtering, pagination, and sorting.
18. Use role-based access control (RBAC).
19. All code should be docker-compatible.
20. Generate migration files for every schema change.

## UI Rules

- Clean admin dashboard design
- Sidebar navigation
- Reusable components
- Dark/light mode ready
- Proper form validation
- Data tables with filters

## Coding Standards

### Frontend

- Use functional React components
- Use hooks
- Keep components reusable
- Avoid large monolithic pages

### Backend

- One Express router file per resource under `src/routes/`
- Keep shared concerns in `src/middleware/` (auth, permissions) and `src/utils/`
- Access the database through the shared `pg` Pool in `src/config/db.js`
- Maintain clean API contracts

## AI Instructions

Before generating code:

1. Analyze current architecture.
2. Verify dependencies.
3. Check module relationships.
4. Preserve backward compatibility.
5. Explain risky modifications before implementation.

Never assume missing logic.
Ask for clarification if business rules are unclear.
