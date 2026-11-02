# ADR-0603 — Tiempo real por WebSocket (Supabase Realtime) en `stock` y `ventas` (2026-11-02)

DECIDÍ (Felipe, 2026-11-02: «debería existir WebSocket en punto de venta, existencias y la tienda web para actualizarse en tiempo
real», y autorizó activar Realtime en producción **solo en `retail.stock` y `retail.ventas`**): el ERP escucha esas dos tablas por
WebSocket. Levanta la precondición pendiente del ADR-0018 («Realtime hoy no está activo sobre ninguna tabla … para y confirma con
Felipe»), que se había dejado como un sondeo «mientras tanto» en Caja (ADR-0116), Vender, Apartados y Cambios (nota del 2026-09-25).

## Qué hace hoy

- **Base:** `20261102212000_realtime_stock_y_ventas.sql` agrega `retail.stock` y `retail.ventas` a la publicación `supabase_realtime`.
  **En producción desde el 2026-11-02** (versión `20261102210741`, verificado: la publicación pasó de 0 a esas 2 tablas). Para
  deshacerlo: `alter publication supabase_realtime drop table retail.stock, retail.ventas;` — las pantallas vuelven solas al sondeo.
- **Web:** `lib/useCambiosEnVivo.ts` abre un canal por pantalla y tabla, filtrado por `ubicacion_id`, y avisa. `lib/cambios-en-vivo-reglas.ts`
  tiene la lógica pura (junta una ráfaga en un aviso, valida el filtro, decide qué hacer con el aviso), con su prueba.
- **Vender, Apartados y Cambios** (`useStockEnVivo`): un cambio en `stock` de la sede dispara la lectura de siempre (la huella y, si cambió, las
  filas). El sondeo de 10 s queda de respaldo, una vuelta de cada seis mientras el socket está conectado.
- **Existencias** (`useRefrescoEnVivo`, en `InventarioPanel`): antes no se enteraba de nada ajeno; ahora un cambio de `stock` en la sede hace
  `router.refresh()` (junta 3 s). Con la pestaña oculta no gasta y refresca al volver; **con una hoja abierta no cambia las cifras debajo de
  quien cuenta o ajusta** y reintenta cada 4 s hasta que se cierre.
- **Caja** (`useCajaEnVivo`): una venta nueva de la sede adelanta el sondeo. El sello también cuenta movimientos de caja, devoluciones y
  cambios, que no están en la publicación, así que su sondeo de 5 s sigue igual.

## Por qué así

1. **El socket solo avisa; no trae datos que se pinten.** La autorización sigue en un solo lugar (RLS + la lectura de siempre). Realtime
   evalúa `stock_select` y `ventas_select` (`fn_puede_operar_ubicacion`) antes de emitir, así que una cuenta solo recibe avisos de sedes que
   ya ve; el filtro por sede solo reduce el ruido.
2. **Principio 9, todo puede fallar.** Si el socket no conecta, se cae o la tabla sale de la publicación, el hook devuelve «no conectado» y
   el sondeo corre como antes: la pantalla funciona igual, solo tarda unos segundos más. Al reconectar avisa una vez, y recupera lo perdido.
3. **Nada de lo que escribe cambia.** Todo guardado sigue por RPC (principio 4); `stock` sigue siendo un snapshot derivado de `movimientos`.
4. **Solo dos tablas.** Cada tabla publicada es una evaluación de RLS por cada suscriptor y cambio, en un proyecto compartido con Dynamic.
   `caja_movimientos`, pedidos web y demás se suman cuando una pantalla lo necesite, con su propio OK.

## Alcance: solo estos tres módulos (Felipe, 2026-11-02)

Felipe cerró alcance: **Punto de venta, Existencias y Caja, y nada más.** Quedan fuera, a propósito, la tienda web y los demás módulos que se
beneficiarían (Pedidos web, Recibir y Traslados, Apartados; el resto ya sondea o lo usa una sola persona). Se retoman solo si Felipe lo pide.

## Fuera de alcance: la tienda web

La tienda lee la base solo por funciones `retail.tienda_*` con un rol sin permiso sobre ninguna tabla (ADR-0408) y no usa el cliente de
Supabase. Un visitante anónimo no puede (ni debe) suscribirse a `stock`. Hoy la tienda comparte el catálogo 30 s entre visitas y, al
«Separar», vuelve a mirar precio y stock en la base. Si algún día se pide «en vivo», las opciones son:

- **Aviso sin datos por Broadcast:** el ERP emite «cambió el stock del modelo X» y la página pide esa ficha por la puerta angosta. No expone
  cifras por el socket; hay que revisar el costo de miles de visitantes conectados.
- **Revalidar la caché en el servidor** cuando el ERP avisa: sin socket en el navegador del visitante; ve el cambio al navegar.

## Verificación

- Pruebas: `lib/cambios-en-vivo-reglas.test.ts` (nueva) y las de stock en vivo; `tsc`, ESLint y Knip limpios; la migración se ensayó en un
  Postgres local con `begin … rollback`.
- **No se pudo probar el socket de punta a punta en local:** los stacks locales no corren el contenedor de Realtime (ADR-0010). La prueba real
  es en producción: abrir Existencias de una sede en dos máquinas y vender/ajustar en una.
