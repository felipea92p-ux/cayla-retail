## 2026-10-24 («Algo nuevo» a varias tiendas y marca nueva con «+» — ADR-0480)
Qué hice:
- **Varias tiendas también en «Algo nuevo»:** se quitó el límite de una sola tienda para una prenda que todavía no está en el catálogo. Repartida, la crea la primera tienda que la recibe; la segunda no la duplica porque la recepción ya avisa «Esa prenda ya existe en esta marca» y ofrece usarla (`nombre_duplicado`).
- **Marca nueva con «+»:** al final de «¿De qué marca?» hay un «+» que cambia la lista por una caja para escribir la marca; la «×» vuelve a la lista. Si lo escrito ya es una marca de la lista, se usa esa y lo dice.
- **La marca se crea al guardar la compra** con `registrar_marca_de_compra` (migración `20261024214000`): con «Mis compras» (o el Catálogo), unida al proveedor, sin duplicarse por mayúsculas o espacios, y anotada en la Actividad a nombre de quien compra.
Por qué así: Felipe 2026-10-24: «quien tiene el módulo puede crear una marca y esta marca se relaciona con el proveedor». Se crea al guardar, no al agregar la prenda: si se cancela la compra no queda una marca suelta, y en una terminal firma quien se elige en «Responsable».
Estado:
- `pnpm pruebas:compras-simple-marca` 6/6, cobertura de módulos 32/32, vitest de `lib/` (606 archivos) y Knip en verde; guía `compras.mi-plata.compra` recorrida a 375 px.
- Probado en el navegador a 375 px en el banco propio: «Algo nuevo» con marca escrita a Lima 3 y Trujillo 3; la base creó la marca unida a CAYLA SAC y dos órdenes.
- La migración `20261024214000` está en producción desde el 2026-10-24 (OK de Felipe), verificada por `md5` de la función.
