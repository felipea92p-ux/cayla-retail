# ADR-0241 · Movimientos conectado: de lo que pasó a lo que sigue, y hecho para el celular

- **Fecha:** 2026-09-26 · **Estado:** Implementado en web (PR pendiente de fusión por Felipe). **Producción:** sin
  migración ni RPC nueva: solo pantalla y lecturas con la RLS de siempre (`apartados`, `separaciones`).
- **Pedido:** Felipe pasó 8 capturas de Movimientos (Todos, Entradas, Salidas, Traslados en 0, Piso ↔ almacén, Ajustes)
  y pidió conectarla con las pantallas nuevas, quitar lo que sobra y hacerla cómoda en el teléfono, «que la mayoría usará
  gran parte del día». Tras el análisis (`docs/pantallas/inventario-movimientos.md`) pidió un spike de **cada** opción
  antes de elegir, y eligió las cuatro recomendadas, los cuatro atajos, el apartado exacto (después de ver su demo),
  Conteo con lista en este mismo trabajo y **no** sumar «Lo que hice yo».
- **Spike:** `docs/maquetas/movimientos-conectado-2026-09/spike.html` (computadora y celular lado a lado; la barra de
  arriba alterna las cinco decisiones).
- **Va encima del PR #512** (otra sesión, «la lista en la primera pantalla y cuántas quedan», ADR-0234 act.): Felipe
  eligió construir sobre su rama en vez de esperar o chocar. El #512 se fusionó a `main` mientras tanto (22:26). Lo que el #512 decidió se
  respeta («quedan N», filtros y lista en una tarjeta); lo que este ADR cambia de él se dice abajo.
- **Numeración:** nació como 0240, que ya tomaba el PR #514 (Existencias).
- **Complementa:** ADR-0234 (leído desde la tienda, operaciones), ADR-0237 (Existencias conectada: `?lineas=`,
  `?variantes=`), ADR-0238 (Comprobantes: Cambio/Devolución por `?q=`), ADR-0166 (Apartados con adelanto), ADR-0161
  (cada atajo solo si se ve el módulo), ADR-0136 (una hoja a la vez), ADR-0206/0238 (celular sin barra de navegación).

## Problema

Después de ADR-0234 la pantalla decía la verdad, pero no llevaba a ningún lado: respondía «qué pasó» y no «¿y ahora qué
hago?». La nota del pie prometía «se corrige con otro movimiento» sin camino a ese movimiento. Tres tropiezos más: una
operación de dos apartados decía **«0»** (`resumirOperacion` solo contaba `interno`), «Traslados 0» se podía tocar y dejaba
la pantalla vacía, y 27 de 84 operaciones de TRU eran bajadas al piso que no cambian el total pero llenaban «Todos». En
el celular había que pasar la cabecera, la franja, dos filas de píldoras y una línea de ayuda antes del primer movimiento.

## Decisiones

1. **Atajos por proceso** (`lib/movimientos-atajos.ts`, lógica pura con pruebas). El detalle trae «Seguir con esta
   prenda»; cada atajo LLEVA a la pantalla que ya hace el trabajo, con la prenda cargada, y solo aparece si la cuenta ve
   ese módulo:
   - Venta con comprobante → **Cambio** (`/cambios?q=B004-000031`) y **Devolución** (`/devoluciones?q=…`). Sin
     comprobante no se ofrecen: Cambios no tendría con qué buscarla.
   - Llegada (proveedor, Taller, producción, stock inicial, traslado recibido; no devolución ni cambio) → **Bajar al
     piso** (si quedó en el almacén; `/inventario/bajar?lineas=<id>:1`, «por escanear», ADR-0237) e **Imprimir
     etiqueta** (`/etiquetas-de-precio?variantes=`). En la fila desplegada de una operación, lo mismo para todo lo que
     llegó junto: «Bajar estas 12 al piso», «Imprimir 12 etiquetas».
   - Corregir (no en ventas ni apartados) → **Contar** (`/inventario/conteo?variantes=<id>`) y **Corregir con un ajuste**
     (solo con `ajustarInventario`: cierra el detalle y abre el `AjustarInventarioModal` de siempre, nunca encima).
   - Cualquiera → **Ver en Existencias** (`/inventario?variante=<id>`: abre el detalle de la prenda en esa talla).
2. **Apartado exacto, sin migración.** Se creía que hacía falta `movimientos.apartado_id`; no: `apartados` ya guarda
   `movimiento_id` y `movimiento_cierre_id`, y `separacion_id` lleva al código y la clienta. `getApartadosDeMovimientos`
   lo lee (una consulta por página, solo si hay apartados en ella); la fila dice «APT-TRU-0014 · María P.», el detalle
   su estado y vencimiento, y «Abrir» lleva a `/vender/apartados?abrir=<id>`: abierto → «Entregar» con ese apartado;
   cerrado → «Todos» buscándolo por su código. La cifra dice «1 apartada» / «2 libres», nunca «0».
3. **Bajadas plegadas por día** (`plegarBajadas`, `FilaBajadas`): en «Todos» y sin búsqueda, las operaciones de piso ↔
   almacén del día son UNA fila («Bajadas al piso · 4 veces · 17 tallas · 10:09–15:18 · ⇄ 99») donde estaba la más
   reciente, que se despliega en ellas. Con una sola no se pliega. Con la píldora «Piso ↔ almacén» o buscando una prenda,
   cada una es su fila (quien viene a confirmar «¿la bajé?» la ve). El conteo del día sigue diciendo las operaciones
   reales.
4. **Celular:** el buscador queda fijo arriba al bajar, con la **cámara** (lee una etiqueta con `EscanerBusqueda` y busca
   esa prenda) y **«Filtros · n»**, que abre una hoja con período, tipo, proceso, zona y Exportar. Bajo el buscador
   quedan «Hoy · 7 días · 30 días» y el tipo elegido con su ×. **«Hoy» es el período por defecto en el celular**, decidido
   en el servidor por el aparato (`userAgent`): sin segunda carga ni parpadeo. Tableta y computadora siguen en 30 días.
5. **Lo repetido:** las tarjetas (y la franja del celular) **se tocan** y filtran como la píldora (tocada otra vez,
   vuelve a «Todos»); las píldoras en 0 se ven pero no se tocan; la fila «Proceso» sale solo si hay entre qué elegir;
   la línea «Filtrando: …» se va (la píldora activa lleva ×); la frase «Toca un movimiento…» se va de la nota (las filas
   ya se ven tocables); «No se edita ni se borra nunca» queda una vez, en la nota. «Exportar» pasa a un «⋯» junto al
   título (con «Copiar enlace de esta vista») en la computadora, y a la hoja de Filtros en el celular.
6. **Conteo acepta `?variantes=`** (`pendientesDeLista`): «Faltan por contar» muestra solo esas tallas y una nota arriba
   dice qué se cuenta. Es seguro sin tocar la base porque `cerrar_conteo` recorre `conteo_items`: ajusta solo lo contado,
   lo demás no queda en cero.

## Lo que cambia del PR #512

- «Exportar a Excel» visible en `acciones` (#512) → dentro del «⋯» (decisión 5, elegida por Felipe en el spike).
- La ayuda de uso que el #512 pasó a la nota del pie → fuera.
- «Ninguna tarjeta es clic» (ADR-0234) → las tarjetas filtran. En el celular la franja es lo primero que toca el pulgar
  y la píldora vive dentro de la hoja.

## Descarté

- **Una píldora «Apartados»** (estaba en el spike): `fn_movimientos` rechaza `p_categoria = 'apartado'`; filtrar por
  apartados pide una migración de lectura. Queda en BACKLOG; los apartados se ven en «Todos» con su código.
- **Un alcance nuevo en la base para «Contar esta prenda»** (`abrir_conteo` con `'variantes'`): más limpio en el
  historial de conteos, pero es migración y la lista acotada ya es segura. El conteo abierto así queda con alcance «todo»
  y pocas prendas contadas; si molesta en la exactitud, se hace después.
- **«Lo que hice yo hoy»**: Felipe dijo que no por ahora (ADR-0127 quitó el filtro por persona).
- **Saldo tras cada fila en el detalle de una operación plegada**: el #512 ya lo da por movimiento.
- **Paginado «Ver más»** en vez de «Siguiente página»: `PaginacionCursor` es de todo el ERP; no se toca aquí.

## Riesgos y cómo se verifica

- **Un atajo a una pantalla sin permiso:** cada atajo pregunta `veModulo` en el servidor (`MODULOS_DE_ATAJOS`);
  Etiquetas de precio no es módulo (la protege la RLS). Pruebas: `lib/movimientos-atajos.test.ts` (12).
- **El `?abrir=` de Apartados con un id que no está en la lista** (otra tienda, más de 200 cerrados): no cambia nada.
- **La cabecera fija del celular:** el buscador se pega a 58 px (`top-[3.625rem]`), el alto de la cabecera `fixed` del
  ERP; la tarjeta usa `overflow-clip` para que `sticky` funcione.
- Pruebas: `lib/movimientos-reglas.test.ts` (+6: apartados, plegado, «Hoy»), `lib/conteo-reglas.test.ts` (+1), y todo
  `vitest` (191 archivos) en verde; `tsc` y `eslint` en verde.
- Verificado en el navegador con una página de prueba temporal (datos inventados, sin sesión, no se sube) a 1440 y
  375 px: bajadas plegadas y desplegadas, «2 apartadas» y su código, detalle de una entrada con Bajar / Etiqueta / Contar
  / Corregir / Existencias, detalle de una venta con Cambio / Devolución, «Bajar estas 2 al piso» en la operación, hoja
  de Filtros con Exportar, buscador con cámara. **Falta verlo con una cuenta real:** Apartados con `?abrir=`,
  Existencias con `?variante=`, Conteo con `?variantes=` y la cámara en un teléfono.
