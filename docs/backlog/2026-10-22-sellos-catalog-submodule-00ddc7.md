## 🏷️ Catálogo ▸ Sellos, la billetera de pases (ADR-0481) — rama `claude/sellos-catalog-submodule-00ddc7`, sin migración

- [x] **Sellos sale de Atributos y es una entrada de Catálogo; Campañas deja de ser fila y es su primera vista** (`/productos/sellos`, pestañas Campañas · Rotación · Artesanal · General). Menú, módulos, íconos, guías, guía de foco, huellas y textos al día; rutas viejas redirigidas.
- [x] **La pantalla es la «II · Pases» de la maqueta v3** (`components/sellos/`, `lib/sellos-pases.ts`, `app/estilos/sellos.css`), con prendas reales y el sello de tinta. Movimiento sin bucles (`lib/sellos-movimiento.test.ts`).
- [ ] **Correr `/chaos` sobre Catálogo ▸ Sellos** (guarda: crear, aprobar, rechazar, configurar, desactivar, reactivar, prendas). Usa las mismas rutas y hojas de antes, pero la pantalla es nueva.
- [ ] **`pnpm --filter web guias:recorrer -- --guia productos.sellos,productos.atributos`** en una máquina con el navegador de Playwright (aquí falta: `pnpm exec playwright install`). La guía se corrió a mano en el navegador del panel (15 pasos, nada escrito).
- [ ] **`/formidable` sobre la pantalla nueva** (obligatoria al terminar una pantalla): no se corrió.
- [ ] **Decisión de Felipe: el punto que respiraba junto a «rige hoy»** (la maqueta lo traía en bucle). Quedó fuera por ADR-0136; si lo quiere, es una línea en `sellos.css` y su excepción en el ADR.
- [ ] **Decisión de Felipe: ¿un solo módulo «Sellos»?** Hoy siguen `etiquetas` y `campanas` (la fila abre con cualquiera). Juntarlos pide mover roles por migración.
- [ ] **`incluye` del módulo Sellos en Roles y accesos** todavía no menciona las campañas («Crear, editar, aprobar y archivar los sellos…»): cambiarlo es una migración de `retail.modulos`.
