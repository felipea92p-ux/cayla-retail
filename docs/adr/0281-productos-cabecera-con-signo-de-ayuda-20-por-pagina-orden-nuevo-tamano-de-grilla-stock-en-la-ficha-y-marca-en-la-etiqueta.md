# ADR-0281 · Productos: cabecera con «!», 20 por página, orden nuevo, tamaño de la grilla, stock desde la ficha y marca en la etiqueta

- **Fecha:** 2026-09-29 · **Estado:** aceptado. Web + **una migración** (`20260929180000_productos_orden_recientes_y_vendidos.sql`,
  solo `create or replace function`; **pegada en producción por Felipe el 2026-09-29**, antes de fusionar la web, y verificada:
  `md5(prosrc)` = `3534a61a8aea1327c30b3c8bd1adeefa`).
- **Pedido:** Felipe, 2026-09-29, con dos capturas de producción (TRU): «el texto descriptivo está un poco compacto…
  un signo ! donde despliegue más información», «paginación… mostrar 20 productos y en los filtros… recientes, viejos, más
  comprados», «poder cambiar de tamaño las imágenes… grande, mediano o pequeño», «en editar un producto que también se pueda
  modificar el stock», «en la etiqueta… que salga la marca de la prenda… que Claude les diga dónde para que no interfiera con
  los nombres o el QR».
- **Complementa:** ADR-0254 (Productos: tabla para todos y cabecera de Ventas), ADR-0270 (una sola cifra; **su decisión 9 se
  revisa aquí**), ADR-0180 (etiqueta de precio 40,1 × 62 mm y su legibilidad en la térmica), ADR-0136 (los modales).
- **Análisis de origen:** `docs/pantallas/productos.md`, `productos-ciclo-de-vida.md` y `catalogo-plan-de-ataque.md` (2026-09-29).

## Decisiones

1. **Cabecera: una frase y un «!».** «Cada prenda del catálogo con sus colores, tallas, precios y cuántas hay en tu sede.» y,
   al lado, el `<Ayuda>` que ya usan Marcas, Categorías y Atributos con lo que antes era un párrafo de cinco líneas (qué se
   hace aquí, qué es «aquí», dónde está el detalle por talla). No hay dos formas de explicar una pantalla.
2. **20 productos por página** (eran 24): `PRODUCTOS_POR_PAGINA` en `lib/catalogo-v2.ts`. La paginación ya existía; lo nuevo es el
   número. Grande, mediano y pequeño no cambian cuántos trae la página, solo cuántos caben por fila.
3. **Orden: cuatro opciones más, decididas en la base.** Un desplegable «Ordenar» junto a las flechas de precio (que Felipe pidió
   el 2026-09-17 en vez de texto y se conservan): **más recientes**, **más antiguos**, **más vendidos (30 días)** y **menos
   vendidos (30 días)**. Comparten el parámetro `?orden=` con las flechas (nunca dos a la vez). El orden se decide **antes de
   cortar la página** (la lista pagina en `fn_productos`), así que ordenar en el navegador ordenaría solo las 20 que llegaron.
   «Vendidos» = unidades de `movimientos` con `tipo = 'salida'` y `motivo = 'venta'` en los últimos 30 días, en toda la red: la
   misma definición y ventana que la demanda de «Pedir a proveedor». Sin ventas, cuenta 0. Solo se calcula si se pide ese orden.
   Los productos de una misma carga (el censo, con la misma hora) desempatan por nombre.
   - *«Más comprados» se entendió como «más vendidos»* (lo que compran las clientas). Si Felipe quería lo que la empresa le
     compra a sus proveedores, es otra consulta (`compra_items`) y otra opción.
4. **Tamaño de la grilla: grande, mediano y pequeño, recordado por cookie.** Por defecto **mediano** (grande era lo único que había
   y a Felipe le resultaba excesivo). Las columnas salen del **ancho disponible** (`auto-fill` con un mínimo por tamaño: 340, 250
   y 180 px), no del ancho de la ventana: con el menú lateral abierto, una ventana de 1024 px deja ~550 px y contar columnas por
   ventana daba tarjetas de 100 px con el texto cortado (se vio y se corrigió). En el celular, 1 · 2 · 3 columnas. «Pequeño»
   deja en la tarjeta solo nombre, código, marca, precio, stock y colores. Es una cookie (`cayla_grilla_tam`) y no `localStorage`,
   igual que el menú lateral: la página la lee en el servidor y no hay salto al hidratar.
5. **Stock desde la ficha de la prenda (Editar) — reabre la decisión 9 de ADR-0270.** ADR-0270 decidió «ajustar stock se hace
   solo en Inventario; se quita del Catálogo». Felipe pide poder modificarlo al editar. Se hace **sin** crear una segunda vía de
   escritura: la ficha abre **la misma ventana de Existencias** (`AjustarInventarioModal`): motivo, responsable, piso o
   almacén, y un movimiento con `ajustar_inventario`. `stock` sigue siendo un snapshot derivado de `movimientos` (principio 4).
   Es un botón «Ajustar stock» junto al total de cada color y un lápiz junto al stock de cada talla; **solo con el módulo
   «Ajustar stock»** (`puede(persona, "ajustarStock")`, lo mismo que exige la base) y **solo de la sede activa** (la ficha
   muestra el stock de todas; el botón lo dice). Es inmediato y **aparte** de «Revisar y guardar»: un ajuste no viaja con los
   cambios del producto ni se deshace con ellos, porque un stock que se movió es un hecho, no un borrador. Descartado: un campo
   numérico editable que se guarda con el producto, porque mezcla dos responsabilidades (catálogo e inventario) y perdería el
   motivo, el responsable y la marca contra el doble clic.
6. **Marca en la etiqueta de precio: al pie, a la izquierda del QR y sobre el código.** Medido en el navegador (40,1 × 62 mm): sin
   campaña sobran 10,6 mm entre el precio y el pie, pero **con campaña solo 1,4 mm** (el bloque «antes / ahora / motivo»
   ocupa ~17 mm), así que una línea nueva sobre el nombre empujaría el QR fuera de la etiqueta. En cambio el pie tiene un hueco de
   16,6 × ~7 mm a la izquierda del QR que existe con y sin campaña. La marca va ahí, en 2 mm y peso 800 (texto chico = 700 como
   mínimo, ADR-0180), en mayúsculas, **dos líneas como máximo** con puntos suspensivos. No suma alto (la fila del pie la manda el
   QR), no toca el nombre y no entra en la zona muda del QR. Verificado con la marca corta, de dos palabras y una de 40 letras,
   con campaña: el pie sigue en 42–59 mm y la etiqueta en 62 mm, sin desborde.
   - Se imprime **siempre**, también cuando la marca es «CAYLA» (sin caso especial): en una prenda propia «CAYLA» aparece arriba
     (isotipo), en el pie (marca) y en «cayla.pe». Si Felipe prefiere ocultarla en las propias, es una condición en
     `EtiquetaPrecio.tsx`.

## Se rompe si

- **La web se publica antes que la migración.** Elegir «Más recientes» o «Más vendidos» daría «Orden de catálogo desconocido»
  (solo esas cuatro: precio y nombre siguen igual). Por eso la migración va primero.
- **Alguien cambia `fn_productos` con un `create or replace` completo.** El parche es por ancla y se detiene sin tocar nada si
  la función viva cambió de forma; un reemplazo completo posterior se llevaría las cuatro opciones. Lo vigila
  `scripts/pruebas/productos_orden.mjs` (en el CI).
- **Dos ajustes de stock a la vez sobre la misma talla.** La base lo resuelve como en Existencias (`ajustar_inventario`, todo o
  nada, marca del intento).
- **Una marca de más de dos líneas de largo.** Se corta con puntos suspensivos; la marca completa sigue en Productos.

## Qué no se hizo

- Los otros puntos del análisis (precio 0 en la base, «A quién pedirle», etc.) siguen en `catalogo-plan-de-ataque.md`.
- Un nombre de marca en la **Vista rápida** de la Grilla (hoy no la muestra): sale del mismo dato, pendiente si se pide.
