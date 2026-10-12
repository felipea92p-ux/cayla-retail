# 2026-10-10 · Órdenes de compra, fase 1: crear, ver, editar, anular, PDF y la revisión Formidable

- **Qué:** la fase 1 de ADR-0362 en un día, en 7 de sus 8 actividades: el módulo «Órdenes de compra» con su lista (`/compras/ordenes`, filtros
  por a dónde llega y por estado, arranca en la sede donde se trabaja), crear (`OC-000001`, número bloqueado, un doble clic no crea dos),
  ver (ventana sobre la lista y página propia en `/compras/ordenes/ver/<id>`), editar mientras está «generada» (con versión, archivo de lo
  de antes y aviso de choque), anular con su motivo, y el papel A4 para imprimir o guardar en PDF (`OC-000129.pdf`). La actividad 7 fue
  `/formidable` (dos pruebas ciegas y un escéptico, `docs/formidable/compras-ordenes.md`): encontró un error real —un reintento con la
  señal cortada podía confirmar un total que la base no guardó— y tres cambios de pantalla que Felipe aprobó y quedaron hechos
  (`6f197aa8`). Rama `claude/purchase-order-redesign-9b0c82`.
- **Por qué:** ADR-0035 había eliminado las órdenes de compra y Felipe las retoma (brief «Compras y LIM Taller», decisiones 1–39). La fase
  1 es la base de las otras seis (comprobante, envío, recepción, deudas del proveedor, fondo por rendir, Taller). Cada actividad se probó
  en un banco aislado (`oc.localhost:3027`, base `cayla-oc`), nunca en la base compartida ni en producción.
- **Cómo:** seis migraciones (`20261010214500`, `…223500`, `…231500`, `…235000`, `…235500` y el arreglo `…235800`), **las seis EN
  PRODUCCIÓN** (pegadas con el OK de Felipe el 2026-10-10, misma huella que el banco); reglas puras con prueba
  (`lib/ordenes-compra-reglas.ts`, `lib/orden-compra-alta.ts`), pruebas de la base `pnpm pruebas:ordenes-compra` (41/41,
  `--contenedor supabase_db_cayla-oc`), vitest completo, `tsc`, eslint, `pnpm focus` y `pnpm sugerir`. `/chaos` (semilla 20261010, 22
  ataques): 5 hallazgos, los cinco arreglados con su prueba y repetidos en el navegador el 2026-10-12. Falta la actividad 8 (traer `main`,
  refrescar el diccionario, el PR): ver el backlog de la rama.
