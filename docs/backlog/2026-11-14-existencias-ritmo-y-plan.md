## ⚡ Existencias: el ritmo fuera del camino de la lista y los pedazos del plan (2026-11-14, sigue a ADR-0662) — solo web, sin migración; rama `claude/existencias-ritmo-y-plan`

- [x] Causa raíz: `hoyLima` arma su formateador una vez (`lib/fechas-lima.ts`); igual a la forma de antes en ~10.000 instantes (prueba).
- [x] El ritmo arranca con las cantidades delgadas (`getCantidadesDeSede` + `pisoDeCadaTalla`, con prueba contra las filas de la lista); la lista las reutiliza (una sola lectura).
- [x] `existencias_tramos`: `cantidades`, `plan_rpc` / `plan_lectura` / `plan_motor`, `ritmo_rpc` / `ritmo_calculo`, `bytes.plan_rpc` / `bytes.ritmo_rpc` y `bucle` (`lib/bucle-de-eventos-servidor.ts`).
- [x] Dañadas: las cinco lecturas que acompañan a la lista van en paralelo (`getPrendasDanadasPendientes`).
- [x] Identidad: md5 del plan, del plan cuadrado, del plan del panel y del ritmo en la copia de un año (3 sedes); huella de filas y dañadas igual a `main` en local (Lima y Trujillo).
- [ ] **Leer 24 h de `existencias_tramos` en producción** y confirmar: `ritmo_calculo` en decenas de ms (no ~1 s), `ritmo` fin antes que `existencias`, `plan` cerca de `plan_rpc` (≈ lo de la base, 0,6 s) y `bucle.max_ms` bajo; si `bucle` sigue alto, lo que traba es el armado de la página (`bytes.panel` ~2 MB).
- [ ] **Etapas** (`fn_productos_aun_no_en_tienda`, 247 ms de media en producción, 56 ms al medirlo hoy): su plan recorre TODOS los movimientos de tienda en cada llamada (11.500 hoy; crecerá con el historial). Reescribirla para que pregunte solo por los productos con orden (índice `movimientos_variante_ubicacion_idx`) pide migración: decidir con Felipe.
- [ ] **El peso de la página** (`bytes.panel` 1,97 MB en producción): es lo siguiente que más pesa en «clic a contenido» (armar, enviar e hidratar).
- [ ] Coordinar con la rama `claude/existencias-pagination-3556ae` (commit `138ae00fa`, sin PR al abrir este): pasa el ritmo a «dos tiempos» y toca las mismas líneas de la página y de `existencias-ritmo-servidor.ts`.
