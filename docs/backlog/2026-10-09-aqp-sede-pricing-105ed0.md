## 🏷️ Precio propio por sede (2026-10-09, ADR-0370) — rama `claude/aqp-sede-pricing-105ed0`

- [x] Base: `precios_sede`, `fn_precio_en_sede`, `poner_precio_sede`/`quitar_precio_sede`, lecturas (`20261010100000`); Actividad en palabras (`20261010100100`); `registrar_venta` (`20261010100200`); Apartados, Cambios, Proformas y Ventas sin registrar (`20261010100300`). Prueba `pnpm pruebas:precio-sede` (20 escenarios, en el CI).
- [x] Web: «Precio por tienda» en Editar producto (guía de foco, `/sugerir`), Vender con «Precio de …» y sondeo en vivo, Apartados/Cambios/Proformas/Ventas sin registrar, «2 precios» en Productos, Existencias, Etiquetas, aviso en Traslados, Historial de la prenda.
- [ ] **No está en producción.** Pegar en orden `20261010100000` → `20261010100100` → `20261010100200` → `20261010100300` (sin políticas, re-ejecutables, fallan sin tocar nada si una función viva cambió). Después, `pnpm datos:generar:produccion` y `pnpm datos:comparar` para que `precios_sede` y las funciones nuevas entren al diccionario.
- [ ] Dar el módulo «Productos» al rol de la cuenta de almacén de Arequipa (Colaboradores ▸ Roles y accesos), si aún no lo tiene: sin él no ve el bloque.
- [ ] La vista previa de «Imprimir lo que entró» en la ficha (`components/ficha-producto/ImprimirLoQueEntro.tsx`) muestra el precio general; lo que imprime (`/etiquetas-de-precio`) ya sale con el de la tienda.
- [ ] En Vender, una línea que ya estaba en el ticket conserva la marca «Precio de …» aunque se quite el precio de la sede mientras tanto (el precio sí se actualiza); solo la marca queda vieja hasta volver a agregarla.
- [ ] `/formidable` del bloque «Precio por tienda» y de su hoja: pendiente de correr con Felipe (propone cambios y espera su OK).
