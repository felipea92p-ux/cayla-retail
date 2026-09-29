## 🏷️ «Imprimir etiquetas» al terminar de crear un producto (2026-09-29, ADR-0180 act. 2026-09-29) — solo web, sin migración; rama `claude/print-labels-after-product-07298b`

- [x] `lib/etiqueta-precio-reglas.ts`: `etiquetasDelAlta` (pura) decide si se ofrece y con qué enlace: producto ya en la
      base + unidades > 0. 3 pruebas nuevas; `tsc`, `eslint` y las pruebas del archivo en verde.
- [x] `components/alta-producto/ProductoCreado.tsx`: tarjeta «Imprimir etiquetas» (`btn-secundario`: la principal sigue
      siendo la de fotos), en otra pestaña. Con ella la cuadrícula pasa a 2 × 2; sin ella, 3 tarjetas como antes.
- [x] Visto en el navegador con datos de ejemplo, con y sin stock, y el enlace revisado (`?producto=<id>`, `_blank`).
- [ ] **Sin probar de punta a punta:** crear un producto con stock en una tienda, tocar el botón e imprimir en la Brother
      (la captura no tuvo sesión). Felipe.
- [ ] Un producto guardado sin conexión no ofrece la tarjeta ni cuando ya subió (la pantalla no guarda su `id`): se
      etiqueta desde Productos ▸ Etiquetas. Si molesta, `ProductoCreado` tendría que recibir el id al subir.
