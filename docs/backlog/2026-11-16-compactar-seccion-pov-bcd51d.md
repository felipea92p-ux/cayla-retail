## 🔖 Apartar compacto, como Cobrar (2026-11-16) — solo web, sin migración; rama `claude/compactar-seccion-pov-bcd51d`

- [x] Maqueta con la hoja de hoy y tres propuestas medidas (`docs/maquetas/apartar-compacto-2026-11/`); Felipe eligió A.
- [x] `ApartarVista`: cabecera con el total, pasos numerados con `CabezaPaso` (ahora en `components/punto-de-venta/CabezaPaso.tsx`, la usan Cobrar, Descuento y Apartar), fichas acostadas, billetes del color del medio, devolución en una fila, casilla corta con «?», pie sin cifras repetidas.
- [x] `CanalDelApartado compacta`: «Se vende en» en una fila.
- [x] Sale `TEXTO_PASO_APARTADO` (la barra de 3 tramos y su texto ya no existen).
- [x] Verificado con datos inventados (sin base): 1440 × 900 claro y oscuro, dos medios con efectivo y vuelto, 375 px sin desborde.
- [ ] Probarla con una cuenta real y la base (la local estaba apagada): buscar ficha, factura, envío por TikTok, guardar de verdad.
- [ ] `/formidable` y `/chaos` de la hoja (guarda: el comportamiento no cambió, pero la pasada falta).
- [ ] Entregar (`EntregarVista`) tiene las mismas fichas viejas con «F1…F5» sin tecla: llevarlas a las fichas acostadas si Felipe quiere.
