# ADR-0234 · Movimientos leído desde la tienda

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe (decisiones D1, D2 y D3, elegidas con la recomendación).
- **Origen:** revisión de usabilidad de `/inventario/movimientos` hecha como una integrante nueva, sin contexto (1366×768
  y 375 px), más la causa de cada tropiezo en el código y las cifras reales de TRU en producción (solo lectura).
- **Producción:** una migración de solo lectura, `supabase/migrations/20260927153000_movimientos_leidos_desde_la_tienda.sql`.
  **No está aplicada:** espera el OK de Felipe. Puede ir antes o después de la web (ver «Cómo se despliega»).
- **Complementa:** ADR-0050 (la categoría es una lectura, no un tipo), ADR-0127 (referencias), ADR-0170 (filtro en dos
  pasos, una sede), ADR-0230 (Exportar de Historial), ADR-0207 (Actividad), ADR-0185 (la página no se encoge).

## Problema

Recorrida por una persona sin contexto, la pantalla decía cosas falsas y escondía lo que se viene a buscar:

1. **«Entradas: nada entró»** con 80 prendas recién llegadas del Taller (TRU), o **«+3»** con 192 (Lima). El detalle de
   esas mismas filas decía «+5 ENTRAN». La etiqueta «Entrada · Traslado recibido» (`etiquetaConDireccion`) existía desde el
   22-09 con sus pruebas, pero ninguna pantalla la usaba.
2. **«16 traslados (+80)»** cuando fue UN traslado de 16 líneas: la tarjeta contaba filas y las llamaba traslados.
3. Una operación grande (el Traslado 1 de Lima, 32 líneas) tapaba todo lo demás: 46 filas para 8 cosas que pasaron.
4. Cuatro nombres para lo mismo (traslados / Transferencias / Transferencia · llegada / Traslado 2) y tres para su
   estado (Cerrada / Completado / Cerrado). Palabras de sistema: sububicación, internos, activación piso/almacén.
5. Buscar «venta» o «traslado» daba 0 resultados, aunque esas palabras estaban en cada fila.
6. Promesas sin cumplir: «ventas en Historial» (la boleta no se abría) y «Consultar y exportar» en Roles y accesos (no
   había cómo exportar).
7. Callejones: el detalle no decía cuánto queda ni llevaba al historial de la prenda; mostraba un código interno; desde un
   traslado no se volvía a Movimientos; Actividad decía «Movimientos todavía no anota su actividad» sobre 18 movimientos.
8. En celular, el primer movimiento empezaba a unos 1.000 px, debajo de tres tarjetas apiladas.

## Decisiones

### D1 · Qué es una «entrada» para una tienda (Felipe: A)

```
DECIDÍ: «Entró» es todo lo que sumó stock a la sede —proveedor, traslado recibido, devolución, cambio, producción, stock
        inicial—; «Salió», todo lo que lo restó —venta, traslado enviado, cambio, dañado—. Los ajustes van aparte. Los cinco
        filtros siguen, leídos desde la tienda: «Entradas» trae también el traslado que llegó y «Salidas» el que salió;
        «Traslados» trae las dos piernas (una fila puede estar en dos filtros: son filtros, no cajones).
DESCARTÉ: (B) una cuarta tarjeta «Traslados recibidos» (la caja de más que Felipe pidió evitar, y la respuesta repartida en
        dos lugares); (C) aclarar la tarjeta en letra chica (la gente lee la cifra grande: el error quedaba).
SE ROMPE SI: un proceso nuevo suma stock con un `tipo` que no es `entrada` ni `traslado` (por ejemplo, un ajuste usado
        como carga): no contaría como entrada. Por eso ADR-0235 cierra el ajuste como primera carga.
```

La categoría EXCLUSIVA de ADR-0050 sigue existiendo en la fila (la usan el color y la etiqueta); lo que cambia es la
lectura de los filtros y las cifras, que ahora miran desde la tienda.

### D2 · Una fila por operación (Felipe: A)

```
DECIDÍ: una operación es lo que se guardó de una sola vez sobre un mismo documento: misma hora exacta (`created_at` es
        `now()`, la hora de la transacción), misma persona, mismo proceso y mismo documento (traslado, conteo, devolución,
        cambio, lote o venta; ninguno si el proceso no tiene). La lista la muestra como una fila que se despliega; las
        cifras cuentan operaciones, no filas; la página nunca corta una operación a la mitad.
DESCARTÉ: agrupar SOLO por documento, porque 116 de los 127 movimientos de TRU no tienen documento (bajadas, ajustes,
        stock inicial, apartados); y SOLO por transacción, porque dos ventas guardadas juntas (la siembra, un script) se
        leían como una sola con la boleta de la primera.
SE ROMPE SI: una función futura guarda una misma operación en varias transacciones, o escribe `created_at` a mano con
        `clock_timestamp()`: se vería partida. La clave vive en dos lugares que deben decir lo mismo:
        `claveOperacion` (lib/movimientos-reglas.ts) y el `count(distinct …)` de `fn_movimientos_resumen_procesos`.
```

### D3 · Exportar (Felipe: A)

Descarga directa (`/inventario/movimientos/exportar`), con los filtros de la pantalla y TODO lo filtrado (hasta 10.000
filas; si hay más, el nombre del archivo lo dice). Una fila por prenda con el efecto sobre la sede con signo, para que la
suma en Excel dé lo que cambió. Se construyó primero como acción de servidor y se cambió a ruta al llegar Exportar de
Historial (ADR-0230) a `main` el mismo día: **una sola manera de exportar en el ERP**. Los textos que Excel leería como
fórmula (=, +, -, @) van con apóstrofo, como en Historial; las cifras quedan como números.

### Lo demás (sin decisión de negocio)

- **Vocabulario de tienda:** «Traslado» en todos lados (nunca «Transferencia», que en el Perú suena a Yape o al banco);
  «Zona» en vez de «sububicación», con rótulo; «Piso ↔ almacén»; «Stock inicial»; «Separación de piso y almacén»;
  «Movido dentro de la sede» (no «Entre piso y almacén»: también mueve de la cuarentena o entre racks del Taller).
- **El estado del traslado** lo dice Traslados con sus palabras: el detalle de Movimientos ya no pone su insignia.
- **El buscador** entiende «venta», «traslado», «ajuste», «conteo», «devolución», «cambio», «stock inicial»… y los
  vuelve su filtro (`filtroDePalabra`); con un número detrás («Traslado 24») sigue siendo una búsqueda.
- **Detalle:** verbo de quién lo hizo («Recibió: …», «Vendió: …»), cuánto hay HOY en la sede (las mismas cuentas que
  Existencias), «Ver todo lo que le pasó a esta prenda», «Ver la venta» (el detalle de Historial, solo si la cuenta ve
  ese módulo) y «Copiar enlace» en vez del código interno.
- **Volver:** un traslado o un conteo abierto desde Movimientos vuelve con «← Movimientos» y los mismos filtros
  (`?volver=`, validado: solo una ruta de Movimientos).
- **Actividad:** una pantalla que solo consulta abre el panel con todos los módulos (`MODULOS_SOLO_CONSULTA`).
- **Celular:** una franja con las tres cifras en vez de tres tarjetas; el primer movimiento se ve sin bajar.
- **Candado «probado = en pantalla»** (`lib/reglas-sin-uso.test.ts`): una función de `lib/*-reglas.ts` que solo usa su
  prueba hace fallar el CI. Las 26 que ya estaban así (otros módulos) quedan en una lista que solo puede achicarse.

### Lo que NO se hizo, a propósito

- **El saldo después de cada movimiento** (kardex fila por fila): «cuánto hay hoy» en el detalle responde la pregunta
  real a una fracción del costo. Si algún día hace falta, se usa `fn_ledger_timeline` (fuente única, ADR-0202), nunca un
  segundo cálculo.
- **«Página anterior»:** con las operaciones agrupadas, la página 2 casi no existe.
- **Quitar el título «Movimientos» por la sede:** la sede se dice en las tarjetas; el título sigue siendo el del menú
  (ADR-0220).

## Cómo se despliega

1. La migración `20260927153000` (solo lectura: parche del filtro «Entradas/Salidas» en `fn_movimientos`, re-pegable, y
   `fn_movimientos_resumen_procesos` nueva). Sin políticas ni `alter`: una sola parte en el SQL Editor.
2. La web. Si sale antes que la migración, la lista funciona y las cifras dicen que no se pudieron leer (principio 9);
   si la migración sale antes, la web de hoy no la llama y no cambia nada.
3. Cuando ninguna web llame a `fn_movimientos_resumen` (la vieja), borrarla en su propia migración.

## Verificación

- `pnpm pruebas:movimientos-desde-la-tienda` (27 verificaciones, ROLLBACK): entró/salió desde la tienda, una operación por
  documento, el cambio una vez, ajustes aparte, permisos. `pnpm pruebas:fn-movimientos-referencias` sigue en 72/72.
- `lib/movimientos-reglas.test.ts` (77), `lib/actividad-reglas.test.ts`, `lib/reglas-sin-uso.test.ts`.
- En el navegador (local, Tienda Lima): «Entró +197 · 194 por traslado · 2 por devolución · 1 por cambio», «Todos 8» con 8
  filas en la lista (antes 46), «venta» en el buscador → Salidas · Venta, el Traslado 3 vuelve a Movimientos con
  «Entradas», la boleta abre su venta, el archivo trae 36 filas para «Entradas», y en 375 px el primer movimiento se ve sin
  bajar.
