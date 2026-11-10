## 🏷️ Precio propuesto con IA (2026-11-10, ADR-0641) — migración `20261110203000` **sin pegar**; rama `claude/pricing-calculation-ai-cc83d7`

- [x] Nuevo producto ▸ «Proponer precio» (Claude Opus 5.5, piso costo + 30 %, .90, «Usar este precio»). Probado en el navegador con un Claude de mentira.
- [x] Sin IA no se cae nada: sin clave, sin costo, tope de US$ 20 gastado, sin respuesta. Los cuatro probados en el navegador.
- [x] Productos ▸ «Revisar precios»: cuatro cifras que filtran y la tabla (cuenta fija, sin IA). Probado a 1440 px, en claro y en oscuro.
- [x] Proponer y aplicar uno por uno con el responsable (`aplicar_precio_propuesto`). Aplicado de verdad en local con foto y restauración de la base.
- [x] Costos solo para quien ve el dinero de Compras, en la base y en la pantalla.
- [x] `pnpm pruebas:precio-propuesto` (28 casos) en la lista del CI.
- [ ] **Pegar la migración en producción** (una sola parte, sin `alter` de tablas en uso ni políticas): espera el OK de Felipe.
- [ ] **Confirmar `ANTHROPIC_API_KEY` en Vercel** (la usa el asistente; sin ella, la pantalla dice «no está encendida todavía»).
- [ ] **Sin probar con la IA real:** el camino con Claude se probó con un servidor de mentira; falta una propuesta de verdad (con la clave en `.env.local` o en una vista previa).
- [ ] **Sin probar a 375 px** (Productos no es de celular obligatorio) y sin `/formidable` completo.
- [ ] La tabla de Revisar precios no tiene la miniatura de la prenda (su cargador no trae foto ni categoría para `MiniaturaPrenda`).
