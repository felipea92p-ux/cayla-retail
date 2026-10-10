## 📄 Clientes ▸ Fichas: 20 por página (2026-10-10) — solo web, sin migración; rama `claude/clientas-pagination-bbf082`

- [x] `POR_PAGINA` de 50 a 20 en `apps/web/lib/clientas-lista-reglas.ts` y su prueba.
- [ ] Una `?pagina=` que ya no existe (se archivaron clientes) muestra la tabla vacía: llevar a la última página existente, como hace `paginar()` de `lib/paginacion.ts`.
- [ ] Decidir con Felipe si el pie pasa a números (1 2 3…) con `PaginacionPaginas` cuando la lista crezca.
