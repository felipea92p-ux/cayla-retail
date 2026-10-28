## 🧩 /unificar, ronda 16: el cierre — el marco, las píldoras y los cierres del mes (2026-10-15, ADR-0358) — solo web, sin migración; rama `claude/unificar-ronda-16`

- [x] **Página de elegir** con tres preguntas (fotos en vivo del marco, demos con el HTML exacto de `<Chip>` y de `<BarrasTiempo>`); Felipe eligió P2 · P1 · P1.
- [x] **El marco:** se queda en trazo 1,5; tamaños a la escala (el menú del celular y el botón del menú a 20; la lupa de la cabecera y «Demo» a 16).
- [x] **Las 12 píldoras** a `<Chip>` (Existencias ×3, Roles ×2, Atributos, Apartados, el responsable Admin, la ficha de un colaborador ×4); `<Chip>` aprendió `title`. `estado` con su candado en `familias.mjs` (deuda 0).
- [x] **«Cómo cerró cada día»** se queda (excepción confirmada en `grafico.barras.md`).
- [x] **Herramientas:** el escáner de guías nombra una pieza que se cierra sola por `texto`, `href`, `id`, `name`, `valor`, `control`, `items` u `onClick`…; 92 huellas aceptadas (solo cambió cómo se nombran). El censo ya no salta un `<aside>` dentro de `main`.
- [x] **Verificado en local** (tras reiniciar Docker: el motor había quedado colgado en «ExitBadState» y hubo que detenerlo y abrirlo de nuevo): `tema:auditar` de Existencias, Colaboradores, Apartados, Atributos y Caja con sus hojas (29 visitas): 0 hallazgos solo en oscuro (los 18 heredados son las cifras de las tallas de Existencias, anteriores). Fotos de después: «1 dañada» con su punto en una tarjeta y la lupa de la cabecera a 16 px. Un censo de `/vender` ya ve los íconos del ticket (el de «Agregar cliente», la bolsa y el % de «Aplicar descuento»).
- [ ] **No se pudo ver en local:** «Sin módulos» y «Sin uso» de Roles (no hay roles así en la base local) y «de fábrica» de la plantilla de Apartados (vive en una hoja).
