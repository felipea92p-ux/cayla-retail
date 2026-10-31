## Cierre de mes: un solo mes, la sede de la barra y el anillo (2026-10-31) — rama `claude/cierre-mes-selector-y-anillo`

- [x] El mes del Cierre sale de la barra común (parte del anterior, no pasa de él); la página lee el mismo; sin el segundo selector.
- [x] La sede de la barra abre esa unidad y la tarjeta tocada se marca en la barra.
- [x] El anillo dice «✓ listo» cuando nada frena (antes «0 cosas»), y el botón «Ver ventas» donde corresponde.
- [ ] **Antes de cerrar octubre (ADR-0485):** decisión 7 (depreciación desde el mes de uso) y decisión 8 (costo de un activo con o sin IGV). Cambian las cifras de octubre.
- [ ] **Decisión de Felipe con el contador:** orden de los meses (cerrar solo si el anterior está cerrado; reabrir solo el último cerrado).
- [ ] Menores de la revisión del 2026-10-31: un egreso de una caja de prueba frena el cierre (la CTE `eg` de `fn_cierre_mes_estado` no excluye `es_prueba`); la base deja cerrar un mes anterior a `inicio_finanzas`; la llave del cerrojo se arma de dos formas (`to_char` en `cerrar_periodo`, `::text` en `reabrir_periodo`); «… y De la empresa ya están listas» se lee raro.
