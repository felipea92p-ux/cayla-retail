## 🧾 Tejido, Patrón, Temporada y Etiquetas con la misma grilla (2026-09-29, ADR-0276) — solo web, sin migración; rama `claude/clarify-requirements-a3319c`

- [x] `components/alta-producto/GrillaMuestras.tsx` nuevo: el marco de tarjeta (`GrillaMuestras`, `TarjetaMuestraBase`,
      `TileVerTodos`) que antes vivía adentro de `ElegirMuestra.tsx`, ahora compartido.
- [x] `ElegirMuestra.tsx` (Tejido/Patrón) reescrito sobre esas piezas, sin cambiar su comportamiento — verificado
      pixel-igual contra la captura original.
- [x] `ElegirTemporada.tsx` nuevo: reemplaza el `<select>` de Temporada por la misma grilla, con «Ninguna» como
      tarjeta punteada. `NuevoProductoForm.tsx` actualizado (se fue `opcionesTemporadaAlta`, el `CampoSelect` de
      Temporada y sus imports).
- [x] `ElegirEtiquetas.tsx` reescrito: grilla chica (`etiquetasALaVista`, nuevo en `lib/etiquetas-alta-reglas.ts`, con
      pruebas) + hoja con el buscador/crear/agrupado que antes estaba siempre visible.
- [x] `pnpm typecheck`, `pnpm lint`, suite completa (227 archivos, 152.704 pruebas) en verde.
- [x] Verificado en navegador con datos de mentira (sin Supabase): a 1440 px y a 375 px, las tres piezas nuevas +
      Patrón sin regresión. Detalle en `docs/bitacora/2026-09-29-clarify-requirements-a3319c.md`.
- [ ] **Sin probar contra datos reales:** el Supabase local de este repo (`supabase_db_cayla-retail`) está atrás en
      migraciones — `retail.categorias` existe con 0 filas, `retail.etiquetas` y `retail.temporadas` ni existen — y
      parece compartido con otra sesión (contenedor con solo 1 hora de vida al momento de este cierre). No se tocó
      para no arriesgar trabajo ajeno. Antes de dar esta pantalla por probada de punta a punta, alguien tiene que
      confirmar que el stack está libre y ponerlo al día (`supabase migration up` o `db reset` + seed), o abrir un
      Postgres desechable propio con el stack completo (no solo la base) para correr `/productos/nuevo` real.
- [ ] **Sin decidir:** si la hoja «Ver todos» de Etiquetas debería tener un tope de tarjetas visibles antes de pedir
      scroll (hoy `max-h-[52vh]` + scroll interno) cuando el vocabulario crezca mucho más allá de las ~11 de hoy.
