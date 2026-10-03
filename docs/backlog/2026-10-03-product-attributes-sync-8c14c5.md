## 🧭 Existencias: filtros con la estructura de Productos y «Hoy» (2026-10-03, ADR-0326) — solo web, sin migración; rama `claude/product-attributes-sync-8c14c5`

- [x] Filtros en la URL sin recargar (`history.pushState`); tallas en curva.
- [x] Barra de píldoras «Prenda / Gestión» de `ui/FiltrosPildora`, chips, «Copiar enlace», hoja en el celular; cookie propia del panel.
- [x] Número en cada opción (conteo disyuntivo, por producto); 52 de 52 opciones verificadas en el navegador.
- [x] Talla y Color de varias; Color por familia con muestra (lectura tolerante de `colores.familia_color`).
- [x] «Hoy» (Por colgar · Por reponer · Sin stock atrás · Mantener) y «Condición» (Dañadas · Apartadas), mismas palabras en tarjeta, lista, cajón y tabla.
- [x] El buscador suma a las píldoras; el estado vacío cuenta productos.
- [x] La tarjeta dice «Solo M · L (de N tallas)» cuando un filtro recorta sus tallas.
- [ ] **Decisión de Felipe:** la tarjeta «Reponer a piso hoy» todavía cuenta por el motor (incluye «Sin stock atrás»). ¿Cuenta solo lo que se puede bajar hoy? (tarea aparte sugerida en la sesión).
- [ ] «Reponer prenda» se enciende si OTRO color del modelo tiene almacén (`ExistenciasTarjetas.tsx`, `hayQueBajar`); tarea aparte sugerida.
- [ ] Ver «Sin stock atrás» con datos reales (la semilla local no tiene ninguna talla así).
- [ ] `/inventario` sigue «pendiente» en la guía de foco por formularios que este trabajo no toca (`MatrizMover`, `SelectorDeAjuste`…).
