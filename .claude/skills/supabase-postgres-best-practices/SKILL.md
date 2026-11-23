---
name: supabase-postgres-best-practices
description: "Postgres best practices maintained by Supabase, for Postgres running anywhere. Load this skill BEFORE writing or changing anything that lives in a Postgres database: creating or altering tables and columns (including choosing column types), schema design, migrations and declarative schema files, RLS policies and the tests that verify them, indexes, triggers, database functions, queues and scheduled jobs (pg_cron, pgmq), vector/semantic search (pgvector), and restoring dumps (pg_restore) or importing data. Also load it when diagnosing slow queries, high CPU, timeouts, EXPLAIN plans, connection exhaustion, locking, bloat, or rows visible to the wrong user or tenant. This is not just a performance guide — schema, migration, security, and SQL authoring tasks need these rules too, even for a one-column change or a single query."
license: MIT
metadata:
  author: supabase
  version: "1.1.1"
  organization: Supabase
  date: January 2026
  abstract: Comprehensive Postgres performance optimization guide for developers using Supabase and Postgres. Contains performance rules across 8 categories, prioritized by impact from critical (query performance, connection management) to incremental (advanced features). Each rule includes detailed explanations, incorrect vs. correct SQL examples, query plan analysis, and specific performance metrics to guide automated optimization and code generation.
---

> **Nota de CAYLA (no es del autor; es lo único que cambia del original).** En este repositorio esta skill **se consulta, no manda**:
> sirve para diseñar bien un índice, una consulta o una política. Producción es el schema `retail` del proyecto de Dynamic, con la
> tienda vendiendo: si algo de abajo choca con `CLAUDE.md` o `.claude/rules/sql-produccion.md`, gana el repo. Ningún ejemplo se corre
> contra producción sin el OK de Felipe. En especial:
> - **Nunca `force row level security`:** las RPC `security definer` del ERP son dueñas de las tablas y dejarían de ver lo que leen.
> - **Lo que bloquea una tabla en uso:** `create index` va `concurrently` (fuera de una transacción), una FK o un `check` nuevo va
>   `not valid` y se valida aparte, y una columna `generated … stored` reescribe la tabla entera. Una migración no mezcla un `alter` de
>   una tabla en uso con políticas: van en partes separadas (ADR-0195).
> - **Nunca borrar datos:** ni `drop table` de una partición vieja ni `delete` en `movimientos` o catálogos con historial (CLAUDE.md,
>   «Reglas de ejecución»): se archiva.
> - **Nada global:** ni `alter system`, ni `max_connections`, ni `revoke`/`grant` amplios sobre un schema; los permisos del repo van
>   función por función (`fn_es_lider()`, `fn_ve_modulo()`).

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## When to Apply

Reference these guidelines when:
- Writing SQL queries or designing schemas
- Implementing indexes or query optimization
- Reviewing database performance issues
- Configuring connection pooling or scaling
- Optimizing for Postgres-specific features
- Working with Row-Level Security (RLS)

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files for detailed explanations and SQL examples:

```
references/query-missing-indexes.md
references/query-partial-indexes.md
references/_sections.md
```

Each rule file contains:
- Brief explanation of why it matters
- Incorrect SQL example with explanation
- Correct SQL example with explanation
- Optional EXPLAIN output or metrics
- Additional context and references
- Supabase-specific notes (when applicable)

## References

- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security
