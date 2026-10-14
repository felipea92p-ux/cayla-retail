## 🗓️ «¿Cuál salida?» dice el día de Lima (2026-10-14) — solo web, sin migración; rama `claude/unruffled-napier-d04633`

- [x] **Cuentas y dinero ▸ Registrar movimiento ▸ «¿Cuál salida?»:** el texto de cada salida lo arma `textoSalida` (`lib/cuentas-dinero-reglas.ts`) con el día de Lima del instante (`hoyLima`), no el de UTC. Prueba en `lib/cuentas-dinero-reglas.test.ts`: las 20:00 y las 23:59 del 13 en Lima, la medianoche de Lima, el fin de mes, un instante vacío o que no se lee. Verificado en el navegador con datos inventados: antes «14 oct», ahora «13 oct». Cierra el pendiente de Cuentas y dinero de `docs/backlog/2026-10-14-sweet-elion-529ad0.md`.
- [ ] **El mismo corte, fuera de Finanzas (visto de paso, sin tocar):** 15 líneas en 12 archivos cortan con `.slice(0, 10)` un instante (salen de `created_at`, `cerrado_en`, `creada_en` e `inventariado_at`, todos timestamptz) y muestran o cuentan el día de UTC: lo hecho de 7 pm a medianoche de Lima cae al día siguiente.
  - Producción: `components/OrdenesTablero.tsx:236` y `:263`, `components/InsumosPanel.tsx:152`, `components/OrdenInsumos.tsx:200` y `lib/observatorio.ts:335` (este filtra contra `desde`: el borde del período se corre).
  - Compras ▸ Notas de crédito: `lib/notas-credito-reglas.ts:212` (la antigüedad en días) y `:582`, `components/NotaCreditoDetalle.tsx:82` y `:186`, `components/NotasCreditoPanel.tsx:477` y `components/NotaCreditoVistaRapida.tsx:77`.
  - Apartados: `components/apartados/EntregarVista.tsx:188` y `TodosVista.tsx:497` (la barra del plazo) y `ModalesApartado.tsx:252`.
  - Análisis: `lib/analisis-datos.ts:117` («Te pidieron y no había»).

  Antes de cambiar cada uno, confirmar en `docs/datos/generado/` que el campo es un instante y no un `date`. Es el trabajo concreto que atraparía el candado de «Ordenar, no corregir» (`docs/backlog/2026-10-14-sweet-elion-529ad0.md`): conviene hacerlo con esa función única, módulo por módulo, y no copiando `hoyLima(new Date(…))` quince veces más.
