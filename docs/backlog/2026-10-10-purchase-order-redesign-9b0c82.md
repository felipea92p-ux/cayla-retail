## Compras ▸ Órdenes de compra, fase 1 (2026-10-10) — rama `claude/purchase-order-redesign-9b0c82`

ADR-0362, fase 1 aprobada por Felipe el 2026-10-10 en 8 actividades. Diseño y decisiones 1–39 en el ADR; traspaso en
`docs/compras/ordenes-de-compra-2026-10/README.md`.

- [x] 1 · **El módulo y la lista** (`ffd60aae`): `ordenes_compra` en Roles y accesos (nace solo para el líder), tablas `ordenes_compra` /
  `orden_compra_items`, `fn_ordenes_compra`; la lista con `EncabezadoPagina` y su vacío.
- [x] 2 · **Crear** (`015b81be`, ajustes `41c6c374`, `6b5d50b6`): `crear_orden_compra` con el id de la pantalla (un doble clic no crea
  dos), número bloqueado y aviso si otra orden tomó el anunciado; guía de foco; firma de la persona o el combo en una terminal (decisión 39).
- [x] 3 · **Ver y filtrar** (`81840ae5`): ventana interceptada sobre la lista y página `/compras/ordenes/ver/<id>`; filtros por destino y
  estado, buscador, cifras, vacío con filtros que se quitan, paginación. Arreglos de paso: el calendario de `CampoFecha` flota (`ed6cad9c`),
  el descuento junto al subtotal (`33952e30`), títulos de columna legibles (`9f347d09`).
- [x] 4 · **Editar** (`bcea0618`, `4d6a710e`): versión que sube sola, `PT409` si otra persona guardó antes, archivo
  `orden_compra_versiones` (nunca se borra lo de antes), Actividad sin montos.
- [x] 5 · **Anular** (`3e46dd5a`): motivo obligatorio (300 letras), irreversible, no libera el número.
- [x] 6 · **PDF** (`d955d4b2`): papel A4 en tinta, `OC-000129.pdf`, una anulada lo dice arriba.
- [x] 7 · **`/formidable`** (`6f197aa8`): dos ciegas y un escéptico; el reintento que confirmaba lo que no se guardó, arreglado en la base
  (CR2b, E2b) y en la pantalla; «Llega a» sin ✓ de fábrica y con «Por repartir» explicado; al guardar, la lista muestra la orden marcada;
  la orden abierta sin datos repetidos. Leyes 6,7 → 7,3 (provisional), oficio 8.
- [ ] 8 · **Cierre:**
  - [ ] Traer `main` (68 commits atrás al 2026-10-10). La app no lo deja hasta que Felipe confirme el origen del repositorio (Help →
        Troubleshooting → Review Pinned Git Origins): `main` cambió `.claude/launch.json`, que es protegido. Después: conflictos probables en
        `guia-de-foco-pantallas.ts` y `ARQUITECTURA.md`; volver a correr las pruebas.
  - [x] **Pegado en producción con el OK de Felipe (2026-10-10)**, en orden, con `apply_migration`: versiones `20261010224526`
        (módulo y tablas), `…224636` (crear), `…224710` (ver y resumen), `…224915` (editar) y `…224946` (anular). Antes se vio que el
        orden 145 del módulo ya lo usaba `liquidacion` y se movió al 148 (`8687a118`). Verificado después: tablas con RLS y sin
        políticas, el módulo sin rol, las 3 claves sin combo, los 2 disparadores, y las 16 funciones con la MISMA huella (md5 de
        `pg_get_functiondef`) que el banco donde pasaron las 40 pruebas.
  - [ ] Refrescar el diccionario desde el volcado (`pnpm datos:generar:produccion`, `pnpm datos:comparar`).
  - [ ] Abrir el PR (lo fusiona Felipe), con las casillas de la plantilla (celular, `/chaos`, Formidable).
- [x] **`/chaos`** sobre crear, editar y anular (2026-10-10, semilla 20261010, 22 ataques en el banco; informe local en el banco): 18
  resistieron (doble clic de mano, red cortada antes y después de guardar, dos pestañas, inyección, permisos sin el módulo…). Quedan 5:
  - [ ] G2 · Editar una orden SIN entrega deja guardar una fecha fuera de rango (año 2999 o pasada): `fn_orden_compra_validar` compara con
        `=` contra la fecha anterior NULL y el IF no se dispara (va con `is not distinct from`; **la función ya está en producción**: migración
        nueva antes de fusionar), y la guía trata esa entrega como «sugerida» y no bloquea. La Actividad escribe la fecha sin año.
  - [ ] G2 · «1.000» en cantidad se lee como 1 y «1.500» en precio como S/ 1.50 (`leerNumero` quita ceros después del punto).
  - [ ] G3 · Dos clics en el mismo instante en «Guardar orden»: una sola orden, pero la pantalla queda en el formulario y se gasta un número.
  - [ ] G4 · Al cerrar «Anular orden» el foco no vuelve al botón (falta `alCerrarEnfocar`).
  - [ ] G4 · Un carácter nulo en un texto muestra un error técnico (pieza común: `traducirError` sin huella para 22P05).
- [ ] **Formidable:** repetir la ciega sobre la pantalla nueva y recalificar; 3–5 colaboradoras reales (la compradora en Gamarra).
- [ ] **Lista aparte, sin orden de Felipe** (`docs/formidable/compras-ordenes.md`): el total tachado de una anulada a 2,86:1; «Editar» último
  en el pie de la orden; «Precio u.»; «Generada» (¿«ya se le mandó»?); la ✕ de quitar una línea a 32 px en celular. Piezas del sistema:
  «Cancelar» junto a «Anular» (en el Perú «cancelar un pedido» es anularlo), «trae», lo sugerido bajo «Faltan», `Boton` 43,75 px contra
  `BotonEnlace` 40 en la misma fila (`campos.tsx:971`), el calendario de `CampoFecha` a 20 px, las cajas de 40 px en celular, y
  `scripts/rendimiento/ui.mjs` que no imprime nada cuando la ruta del repo tiene un espacio.
