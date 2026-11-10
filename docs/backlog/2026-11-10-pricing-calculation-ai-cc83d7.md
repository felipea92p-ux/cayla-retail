## 🏷️ Precio propuesto con IA (2026-11-10, ADR-0641) — migración `20261110203000` **en producción desde el 2026-11-10**; rama `claude/pricing-calculation-ai-cc83d7`

- [x] Nuevo producto ▸ «Proponer precio» (Claude Opus 5.5, piso costo + 30 %, .90, «Usar este precio»). Probado en el navegador con un Claude de mentira.
- [x] Sin IA no se cae nada: sin clave, sin costo, tope de US$ 20 gastado, sin respuesta. Los cuatro probados en el navegador.
- [x] Productos ▸ «Revisar precios»: cuatro cifras que filtran y la tabla (cuenta fija, sin IA). Probado a 1440 px, en claro y en oscuro.
- [x] Proponer y aplicar uno por uno con el responsable (`aplicar_precio_propuesto`). Aplicado de verdad en local con foto y restauración de la base.
- [x] Costos solo para quien ve el dinero de Compras, en la base y en la pantalla.
- [x] `pnpm pruebas:precio-propuesto` (28 casos) en la lista del CI.
- [x] **Migración pegada en producción** el 2026-11-10, con el OK de Felipe (una sola parte, sin `alter` de tablas en uso ni políticas). Verificada con consultas de solo lectura: tabla con RLS y sin políticas, 19 checks, 4 llaves, 3 índices, 0 filas y las 5 funciones sin `EXECUTE` para `anon`.
- [ ] **Refrescar el diccionario** (`docs/datos/generado/`): `precio_propuestas` entra cuando se refresque el volcado de producción (`COMO-REFRESCAR.md`).
- [ ] **Confirmar `ANTHROPIC_API_KEY` en Vercel** (la usa el asistente; sin ella, la pantalla dice «no está encendida todavía»).
- [ ] **Sin probar con la IA real:** el camino con Claude se probó con un servidor de mentira; falta una propuesta de verdad (con la clave en `.env.local` o en una vista previa).
- [ ] **Sin probar a 375 px** (Productos no es de celular obligatorio) y sin `/formidable` completo.
- [ ] **Eliminar una prenda que tuvo una propuesta:** `precio_propuestas` es historia (su suma alimenta el tope de US$ 20) y su llave a `productos` frena el borrado, pero `fn_producto_historia` aún no la nombra: Catálogo mostraría el error de la llave en vez de «tuvo una propuesta de precio» (como `trafico_web`). Renglón nuevo, con migración aparte.
- [ ] La tabla de Revisar precios no tiene la miniatura de la prenda (su cargador no trae foto ni categoría para `MiniaturaPrenda`).
