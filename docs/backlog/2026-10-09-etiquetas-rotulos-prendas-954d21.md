## 🪧 Rótulos de anaquel (2026-10-09, ADR-0366) — solo web, sin migración; rama `claude/etiquetas-rotulos-prendas-954d21`

- [x] `/rotulos`: buscador de modelos, uno por modelo o todos en un rótulo (hasta 4), copias, vista previa a tamaño real.
- [x] Rótulo de 62 × 100 mm (`RotuloAnaquel`, `app/estilos/rotulo.css`) con categoría, nombre, colores, tallas y códigos.
- [x] Entradas: «Rótulo» en lo marcado de Productos y de Existencias; acceso «Rótulos» en Inicio de Almacén.
- [x] `useImpresionBrother`: un solo camino a la Brother para etiquetas y rótulos.
- [x] Ayudante de Mac v2: `?medida=62x100mm` con lista cerrada; prueba con Chrome real.
- [ ] Imprimir uno real en la Brother de la tienda (Windows) y en una Mac con el ayudante reinstalado.
- [ ] Guía de impresión: agregar el papel «62 mm» (100 mm) para rótulos si en Windows sale distinto.
- [ ] Decidir (Felipe): anaqueles como lugar del sistema (código A-01, «está en A-03» en Buscar).
