## 🎨 «+ Nuevo color» del alta con #hex o RGB (2026-09-28, ADR-0260) — solo web, sin migración; rama `claude/nuevo-color-hex-rgb`

- [x] `components/SelectorColor.tsx` (sale de `ColoresLista.tsx`): `SelectorColor` (con `caja`, `etiqueta`, `deshabilitado`) y `MuestraEditable`. Atributos lo usa igual que antes.
- [x] `NuevoColorAlta` usa `SelectorColor caja` («Color · #hex o RGB»), alineado con Familia y Código; a 375 px, el nombre y el color van a lo ancho.
- [x] `tsc`, `eslint` y pruebas de color en verde; probado en navegador con `217, 166, 161` y `#b3573f` a 1280 y 375 px (página de prueba sin sesión).
- [ ] **Sin probar:** Catálogo ▸ Atributos ▸ Colores con cuenta real (solo cambió de dónde se importa el control).
