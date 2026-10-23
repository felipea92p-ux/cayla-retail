## 🏷️ Catálogo ▸ Insignias (antes «Sellos»), la billetera de pases (ADR-0481) — rama `claude/sellos-catalog-submodule-00ddc7`

- [x] **Sellos sale de Atributos y es una entrada de Catálogo; Campañas deja de ser fila y es su primera vista** (`/productos/insignias`, pestañas Campañas · Rotación · Artesanal · General). Menú, módulos, íconos, guías, guía de foco, huellas y textos al día; rutas viejas redirigidas.
- [x] **La pantalla es la «II · Pases» de la maqueta v3** (`components/sellos/`, `lib/sellos-pases.ts`, `app/estilos/sellos.css`), con prendas reales y el sello de tinta. Movimiento sin bucles (`lib/sellos-movimiento.test.ts`).
- [ ] **Correr `/chaos` sobre Catálogo ▸ Insignias** (guarda: crear, aprobar, rechazar, configurar, desactivar, reactivar, prendas). Usa las mismas rutas y hojas de antes, pero la pantalla es nueva.
- [ ] **`pnpm --filter web guias:recorrer -- --guia productos.sellos,productos.atributos`** en una máquina con el navegador de Playwright (aquí falta: `pnpm exec playwright install`). La guía se corrió a mano en el navegador del panel (15 pasos, nada escrito).
- [ ] **`/formidable` sobre la pantalla nueva** (obligatoria al terminar una pantalla): no se corrió.
- [ ] **Decisión de Felipe: el punto que respiraba junto a «rige hoy»** (la maqueta lo traía en bucle). Quedó fuera por ADR-0136; si lo quiere, es una línea en `sellos.css` y su excepción en el ADR.
- [ ] **Decisión de Felipe: ¿un solo módulo «Insignias»?** Hoy siguen `etiquetas` y `campanas` (la fila abre con cualquiera). Juntarlos pide mover roles por migración.
- [ ] **`incluye` del módulo Insignias en Roles y accesos** todavía no menciona las campañas («Crear, editar, aprobar y archivar las insignias…»): `20261023142000` lo reescribe sin ellas; sumarlas es otra línea en `retail.modulos`.
- [x] **«Sellos» se llama «Insignias» en todo el ERP** (Felipe 2026-10-23): pantalla, menú (con una medalla), guía, Nuevo producto, ficha, historial, Tienda web, Finanzas, Actividad y errores.
- [x] **`20261023142000_sellos_se_llaman_insignias.sql` pegada en producción** el 2026-10-23, a pedido de Felipe (`apply_migration`, registrada como `20261023143103`): el módulo `etiquetas` se llama «Insignias» y los diez mensajes dicen «Insignias»; md5 de las siete funciones en el PR #1273.

