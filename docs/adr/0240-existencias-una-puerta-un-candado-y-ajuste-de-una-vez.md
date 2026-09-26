# ADR-0240 · Existencias: una puerta, un candado; y «Ajustar» de una vez

- **Fecha:** 2026-09-26 · **Estado:** fusionado (PR #514) y publicado. **Producción:** `20260927180000` y
  `20260927180100` **aplicadas el 2026-09-26** (ver «Aplicación en producción», al final); `20260927180200` (los
  `revoke`) **todavía no**.
- **Pedido:** análisis `/pantalla` de Existencias (`docs/pantallas/inventario.md`). Felipe ordenó la tarea **#3 con la
  opción A** y la **#1**.
- **Migraciones:**
  - `20260927180000_existencias_una_puerta_un_candado.sql` (puertas nuevas);
  - `20260927180100_ajustar_inventario_de_una_vez.sql` (ajuste de una vez);
  - `20260927180200_existencias_puertas_internas.sql` (cierra las piezas internas; va DESPUÉS de publicar la web).
- **Complementa:**
  - ADR-0161: el rol decide, módulo por módulo.
  - ADR-0208: «Bajada al piso» como módulo. Este ADR revierte una consecuencia que ADR-0208 aceptó; ver «Descarté».
  - ADR-0141: apartar stock.
  - ADR-0212 y ADR-0235: la carga inicial.
  - ADR-0190: orden de candados.

## Problema

**#3 · Dos puertas para la misma escritura, con candados distintos.**
- Bajar prendas del almacén al piso:
  - por «Bajar al piso» (`bajar_al_piso`) pedía el módulo «Bajada al piso»;
  - por «Reponer al piso» o «Retirar del piso» del detalle de la prenda (`mover_interno`) hacía el mismo movimiento sin
    preguntar ningún módulo.
- «Apartar» (`apartar_stock`) tampoco preguntaba «Apartados».
- Un rol con Existencias y sin esos módulos podía hacer las dos cosas. En la siembra local ese rol es «Integrante».
- Una de las dos puertas estaba mal, aunque las dos funcionaran.

**#1 · «Ajustar inventario» guardaba línea por línea.**
- Primero cargaba lo nuevo (`cargar_stock_inicial`) y después hacía una llamada `registrar_movimiento` por cada ajuste,
  sin marca de reintento.
- Si la red se cortaba a mitad, quedaban unas líneas aplicadas y otras no.
- Con un corte de red el modal no sabía cuáles habían llegado, y al reintentar las volvía a mandar: el ajuste se
  duplicaba.

## Decidí

1. **Opción A (Felipe): cada escritura es del módulo que la nombra.**
   - Mover piso ↔ almacén es de «Bajada al piso».
   - Apartar desde Existencias es de «Apartados».
   - Es lo que ya dice Roles y accesos.
2. **Puertas nuevas para la pantalla, en vez de poner el candado dentro de las funciones de siempre.**
   - `mover_entre_piso_y_almacen` = `mover_interno` + el módulo + solo el par piso ↔ almacén de esa tienda.
   - `apartar_prenda` = `apartar_stock` + el módulo.
   - El candado no va adentro porque `apartar_stock` también la usa recibir un traslado con pedido. La llama un
     disparador en nombre de quien RECIBE, con el módulo Traslados, que puede no tener «Apartados».
   - Por el mismo motivo, `mover_interno` también la usan `separar_pedido_para_apartar` (Apartados) y `bajar_al_piso`.
   - Un candado adentro habría roto recibir traslados.
3. **Las piezas internas se cierran al navegador** (parte 2: `revoke execute ... from authenticated`).
   - Las funciones `security definer` que las usan corren como su dueño y no pierden nada.
   - La prueba lo comprueba con `bajar_al_piso`.
4. **La pantalla muestra el botón solo si va a funcionar.**
   - `puedeReponer` pide `puedeBajarAlPiso` y `puedeApartar` pide `veApartados`, los dos decididos en el servidor.
   - En la talla por colgar, quien no tiene el módulo lee: «Para colgarla, pídesela a quien tenga el módulo «Bajada al
     piso»».
5. **«Ajustar» de una vez: `ajustar_inventario`.**
   - Una transacción con las prendas nuevas (por `cargar_stock_inicial`) y los ajustes (por `registrar_movimiento`).
     Esas funciones se llaman, no se copian: sus candados siguen puestos.
   - La marca de reintento es obligatoria y se guarda en `ajustes_inventario_intentos`, tabla que no se edita ni se
     borra, con la huella de todo lo enviado.
   - Orden de candados: la marca y después el stock de todas las prendas en orden (`fn_bloquear_en_orden`).
   - El modal genera una marca cada vez que se abre.
   - Si la respuesta no llega, los campos quedan fijos y se reenvía lo mismo: la base devuelve lo ya guardado.
   - Lo que no depende de la pantalla vive en `lib/ajuste-reglas.ts`, con sus pruebas: `argumentosDeAjuste`,
     `textoExitoAjuste`, `leerResultadoAjuste` y `TEXTO_AJUSTE_INCIERTO`.

## Descarté

- **La opción B: que reponer sea parte de «Existencias».**
  - Habría abierto el botón «Bajar al piso» a todo el que ve Existencias.
  - ADR-0208 ya había descartado eso («Existencias no implica la bajada»).
- **Mantener la consecuencia que ADR-0208 aceptó.**
  - ADR-0208 aceptó que «Reponer» siguiera funcionando con solo Existencias. La prueba `bajada_al_piso.mjs` lo
    afirmaba: «rol con SOLO Existencias no baja por aquí, pero Reponer le sigue funcionando».
  - Con la opción A eso deja de ser cierto, y la prueba ahora afirma lo contrario.
- **Poner el candado de módulo dentro de `mover_interno` y `apartar_stock`.** Rompería recibir traslados y separar
  pedidos (ver 2).
- **Para «Ajustar»: quitar del formulario las líneas ya aplicadas, como hacía el modal.**
  - Solo funciona si la base alcanza a responder.
  - Con un corte de red no se sabe qué llegó. El problema se resuelve con una transacción y una marca, no con la
    pantalla.

## Se rompe si

- **Se publica la web sin encender antes los módulos en los roles que hoy reponen o apartan.**
  - En producción, al 2026-09-25 (ADR-0208), el rol «Integrante» no veía Existencias.
  - Las 3 «Terminal Almacén» y las 3 «Terminal de ventas» sí la veían, y reponían el piso con «Reponer».
  - Si su rol no tiene «Bajada al piso», el día de la publicación pierden «Reponer» y «Retirar del piso».
  - Si no tiene «Apartados», pierden «Apartar» desde Existencias.
  - **Antes de publicar, Felipe revisa en Roles y accesos** qué roles necesitan esos módulos. Nunca se asignan desde el
    código (ADR-0161).
- **Una pantalla nueva llama a `mover_interno` o `apartar_stock` desde el navegador.** Después de la parte 2 recibe
  «permission denied». Es a propósito: la puerta con candado es la otra.
- **Dos personas ajustan la misma prenda a la vez, cada una con su criterio.** Las dos pasan, una detrás de la otra.
  `ajustar_inventario` evita el ajuste a medias y el duplicado por reintento, no el choque de dos criterios.

## Cómo se despliega (producción: con el visto bueno de Felipe)

1. Felipe enciende «Bajada al piso» y «Apartados» en los roles que los necesiten (Roles y accesos).
2. Se pegan `20260927180000` y `20260927180100`, cada una sola. Solo crean funciones y una tabla nueva, sin políticas.
3. Se publica la web.
4. Se pega `20260927180200` (los `revoke`).
5. Se refresca el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) y se corre `pnpm datos:comparar`.

## Verificación (local)

- `pnpm pruebas:existencias-candados-y-ajuste`: **33/33**, prueba nueva. Cubre:
  - sin los módulos, las puertas frenan y las piezas internas dan 42501;
  - con los módulos, las puertas funcionan como antes;
  - la puerta de piso no mueve a cuarentena;
  - `bajar_al_piso` sigue bajando;
  - los permisos;
  - «Ajustar» todo o nada, con marca: el reintento no duplica y otros datos con la misma marca se rechazan;
  - los candados de siempre siguen puestos (`carga_con_historia`, `ajuste_sin_historia`, sin motivo, vacío, repetida);
  - quien no puede ajustar, no ajusta.
- **Pruebas actualizadas porque afirmaban el hueco o llamaban a las piezas internas desde el navegador:**
  - `bajada_al_piso.mjs` 51/51;
  - `mover_interno_marca.mjs` 12/12 (ahora por la puerta, con la terminal en un rol con el módulo);
  - `concurrencia_orden_y_doble_clic.mjs` 15/15.
- **Siguen en verde:**
  - `apartar_stock` 46, `actor_firma_las_operaciones` 30, `frescura_bajadas` 64, `reposicion_piso_cerrada` 10;
  - `cuarentena_no_se_vende` 8, `fn_aplicar_movimiento` 11, `fn_ledger_fuente_unica` 48;
  - `pedidos_no_atendidos` 19, `separaciones` 77, `ajuste_no_es_primera_carga` 25.
- **`lib/ajuste-reglas.test.ts`:** 27 casos.
- **En el navegador, con la cuenta de líder, cortando a propósito la llamada para no escribir en la base compartida:**
  - «Ajustar» manda UNA llamada `ajustar_inventario` con las dos listas y la marca;
  - ante el corte, dice «no sabemos si llegó a guardarse… si ya se guardó no se repite»;
  - congela los campos, y el reintento viaja con la **misma** marca;
  - «Reponer al piso» llama a `mover_entre_piso_y_almacen`;
  - la base quedó sin filas nuevas.
- **Falta:**
  - verlo con una cuenta sin los módulos;
  - revisar los roles de producción (paso 1).

## Aplicación en producción (2026-09-26, noche)

**Qué pasó:**
- El PR #514 se fusionó y Vercel publicó la web (`792158aa`, 22:56 UTC) **antes** de pegar las migraciones: el orden
  de arriba decía lo contrario.
- La base de producción no tenía `mover_entre_piso_y_almacen`, `apartar_prenda` ni `ajustar_inventario` (consultado
  en vivo, solo lectura).
- Durante unos minutos, «Reponer», «Retirar del piso», «Apartar» y «Ajustar» pudieron fallar en las tiendas.

**Qué se hizo, con el visto bueno de Felipe en el momento:**
1. Se comprobaron en producción las firmas de las funciones que llaman las nuevas: `mover_interno`, `apartar_stock`,
   `cargar_stock_inicial`, `registrar_movimiento`, `fn_ve_modulo`, `fn_bloquear_en_orden`,
   `fn_historial_sin_truncate` y `fn_puede_operar_ubicacion`. Las ocho coinciden con local.
2. Se ensayó cada migración en una transacción con `ROLLBACK`.
3. Se aplicaron `20260927180000` y `20260927180100` con la integración de Supabase.
4. Verificado:
   - las tres funciones existen, `authenticated` las ejecuta y `anon` no;
   - la huella del cuerpo sin comentarios (`md5` de `prosrc`) es idéntica a la de local;
   - `ajustar_inventario` sin marca responde `ajuste_sin_token` y no guarda nada.

**Sigue pendiente:**
- `20260927180200` (quitarles el permiso de ejecución desde el navegador a `mover_interno` y `apartar_stock`). No
  rompe nada si se pega: la web ya usa las puertas nuevas.
- **Roles, consultado en vivo el 2026-09-26:**
  - «Integrante» (17 cuentas) tiene Existencias, «Bajada al piso» y «Apartados»: no pierde nada.
  - «Terminal Almacén» y «Terminal de ventas» ven Existencias **sin** «Bajada al piso» ni «Apartados». Con la web
    publicada, ya no ven «Reponer», «Retirar» ni «Apartar». Si deben tenerlos, Felipe los enciende en Roles y accesos.
- Refrescar el volcado (`pnpm datos:refrescar`).

**Lección:** una migración que la web necesita se pega ANTES de fusionar, no «antes de publicar». En este repo,
fusionar a `main` ES publicar.
