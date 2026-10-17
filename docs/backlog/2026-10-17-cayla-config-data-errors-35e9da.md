## Gasto fijo: cuándo llega + proveedor a la vista (ADR-0440)
- **No está en producción:** pegar `20261017190000_gastos_fijos_momento_del_mes.sql` (una sola parte, sin políticas). La web funciona antes y después.
- **Sin probar:** la nube no tenía Docker. En local: `pnpm pruebas:activos-y-fijos` (caso 6b nuevo), flujo de caja, resumen, cierre, `pnpm pruebas:roles-cobertura`.
- Verificar en navegador el modal (claro y oscuro) y correr `guias:huella`/`guia-de-foco` si lo piden.
- Pendiente: `fn_gastos_fijos_sugeridos` sigue proponiendo siempre un día; el Resumen no trae `momento` (usa la fecha esperada).
