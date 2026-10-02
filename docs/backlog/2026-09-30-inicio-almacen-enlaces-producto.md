## 🧭 Inicio de almacén: enlaces a la ficha del producto (2026-09-30, ADR-0292, Felipe) — solo web; rama `claude/inicio-almacen-enlaces-producto`

- [x] Los enlaces del Inicio de almacén a un producto iban a `/productos/{id}` (404). Ahora van a `/productos/{id}/editar` y «Tomar foto» a `/productos/{id}/editar#fotos` (`hrefFichaProducto`, `hrefFotosProducto`).
- [x] Candado: `lib/inicio-almacen-enlaces.test.ts` (todo enlace literal del Inicio de almacén cae en una ruta que existe bajo `app/(app)`).
- [ ] **Menor, decisión de Felipe:** desde el Inicio, «← Productos» de la ficha vuelve a `/productos`, no al Inicio. `?desde=` solo admite rutas de Productos (`lib/vuelta-productos.ts`, `desdeSeguro`): ampliarlo es tocar una lista de seguridad y cambiar el rótulo de la flecha.
- [ ] **Sin probar:** Safari y Firefox; con la terminal real, abrir la ficha de un producto de producción desde el Inicio.
