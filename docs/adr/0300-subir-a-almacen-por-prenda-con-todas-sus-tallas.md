# ADR-0300 · «Subir a almacén» por prenda: todas sus tallas en una ventana, y una función que no deja la subida a medias

- **Fecha:** 2026-10-01 · **Estado:** construido en la rama `claude/subir-a-almacen-por-prenda`, PR abierto. **Producción: la migración
  `20261001150000_retirar_del_piso.sql` se pegó el 2026-10-01** (con el ok de Felipe, ensayada antes en una transacción que se revierte sola y
  verificada después: ver «Aplicación en producción»). La web que la llama **todavía no está fusionada**: nadie ve el botón hasta fusionar.
- **Pedido:** Felipe, 2026-10-01: un botón **«Subir a almacén»** entre «Reponer» y «Ajustar» en la tarjeta de Existencias; y que «Ver detalle» quede
  **solo con su icono, chico**, y diga «Ver detalle» al pasar el mouse.
- **Complementa:** ADR-0295 (Reponer por prenda), ADR-0208 (bajada y retiro del piso, marca de reintento), ADR-0240 (una puerta, un candado),
  ADR-0231 (CAYLA no sugiere cuánto mover), ADR-0284 (guía de foco), ADR-0161 (Responsable), ADR-0190 (candados en orden).

## Qué había

- **«Subir a almacén» es lo que ADR-0208 llamó «Retirar del piso»** (piso → almacén de la misma tienda, con nota), y **no tenía entrada en la pantalla**
  desde `46e8abb6` (el cajón lateral único le quitó el menú «⋯» por talla, su única llamada). ADR-0295 lo dejó anotado; Frescura y Ajustar siguen
  mandando a la gente a usarlo.
- **La única puerta, `mover_entre_piso_y_almacen`, mueve UNA talla por llamada.** «Reponer» sube varias tallas de una vez porque existe `bajar_al_piso`;
  para el sentido contrario no había nada. Una ventana por prenda con varias tallas, llamando una vez por talla, dejaría la prenda **subida a medias**
  (la S ya está en el almacén, la M sigue colgada) si la red se corta entre las dos: justo lo que ADR-0208 y ADR-0295 descartaron.

## Decidí

DECIDÍ: un botón **«Subir a almacén»** que abre la **prenda entera** (todas sus tallas), igual que «Reponer» pero al revés, y que al confirmar hace
**UNA llamada a una función nueva, `retirar_del_piso`**, que sube todas las tallas elegidas en una sola transacción.

1. **La función (`20261001150000_retirar_del_piso.sql`).** `retirar_del_piso(p_ubicacion_id, p_items, p_nota, p_token)`:
   - mismo módulo («Bajada al piso»), mismo permiso de tienda y mismo Responsable que `mover_entre_piso_y_almacen`;
   - bloquea el stock de todas las tallas en orden (`fn_bloquear_en_orden`) y mira con el candado tomado si **todas** alcanzan en el piso (lo libre =
     cantidad − apartadas); si alguna no, **no mueve ninguna** y dice cuáles, con su detalle en JSON para marcar cada fila;
   - si todo alcanza, cada talla es un `mover_interno` piso → almacén: **la misma fila del libro** que ya escribe «Retirar del piso» (Movimientos y
     Frescura la leen sin cambios; Frescura reconoce el retiro por su par exacto de origen y destino).
2. **El reintento no necesita una tabla nueva.** La marca de cada talla se deriva de la de la lista (`md5(marca ':' variante)`) y la guarda el propio
   `mover_interno` en `movimientos_internos_intentos`. Reenviar la misma lista devuelve `ya_registrada` sin mover nada, **aunque el piso ya haya bajado a
   cero** (la pre-validación no corre sobre lo ya guardado); la misma marca con otra cantidad la rechaza `mover_interno`.
3. **La ventana** (`SubirAAlmacenModal`) comparte `SelectorDeTallas` con «Reponer» (una fila por talla: lo que hay de cada lado y un control − 0 +):
   se ve y se toca igual. Lo suyo: sale del **piso**, lleva una **nota opcional** (hasta 200 caracteres: el único rastro de por qué se guardó) y avisa antes
   de confirmar si alguna talla va a quedar **pidiendo reponer** (`quedaraPidiendoReponer`: la misma regla que pinta la fila, `calcularAccionHoy` + la
   política de la sede). Arranca en cero (ADR-0231). Con guía de foco (ADR-0284).
4. **Si falla, dice dónde y no deja nada a medias.** «No se subió nada: revisa las tallas marcadas» y la fila dice «Solo queda 1 libre en el piso»; las
   cifras se releen solas. Tras un corte de red las cifras se congelan y el botón pasa a «Confirmar de nuevo» (misma marca, no se repite).
5. **La tarjeta.** Orden: **Reponer · Subir a almacén · Ajustar · [icono]**. «Ver detalle» pasa a un botón de 34 px con su icono y el tooltip del
   proyecto (`ui/tooltip`, 200 ms); conserva `aria-label="Ver detalle"`. Los botones envuelven (`flex-wrap`): en el celular bajan a dos renglones en vez
   de cortarse. Mismo permiso que «Reponer» (`puedeReponer`); apagado, con su motivo, si no hay nada libre en el piso. **También** como acción en el
   cajón de la tabla («Operar esta prenda»), para que las dos puertas ofrezcan lo mismo.
6. **Se retira lo que dejó sin uso.** `ReponerPisoModal` (el de UNA talla: nadie lo abre ya), el estado `moviendo` del panel y, de
   `lib/inventario-reglas.ts`, `SENTIDO_PISO`, `topeMovimientoPiso`, `mensajeErrorMovimientoPiso` y `textosBloqueRetiro`. `avisoTrasRetiro` devolvía
   textos largos que ninguna pantalla muestra: pasa a la pregunta sí/no `quedaraPidiendoReponer`.

## Descarté

DESCARTÉ: **llamar `mover_entre_piso_y_almacen` una vez por talla** porque la segunda puede fallar con la primera ya guardada y la prenda queda
subida a medias; cada talla además necesitaría su propia marca y su propio manejo de cortes. Es lo que ADR-0208 descartó para la bajada.
DESCARTÉ: **darle un sentido a `bajar_al_piso`** porque guarda una cabecera (`bajadas_piso`) que alimenta Frescura, y un retiro **no es una bajada**
(Frescura lo resta de las bajadas, ADR-0208 c): mezclarlos obligaría a que cada lectura de bajadas aprendiera a ignorar las cabeceras de retiro.
DESCARTÉ: **una tabla de marcas propia para el retiro** porque la marca por talla ya la guarda `mover_interno`; una tabla más sería otra cosa que
inmutabilizar, vaciar en las pruebas y explicar, sin dar nada que la marca derivada no dé.
DESCARTÉ: **un botón «Subir» por talla dentro del cajón** (mi primera idea en ADR-0295) porque Felipe pidió el botón en la tarjeta de la prenda, y la
subida de varias tallas es el caso de verdad (fin de temporada: se guarda la prenda entera).
DESCARTÉ: **un tooltip propio o solo el `title` del navegador** porque el proyecto ya tiene `ui/tooltip` (instantáneo, con el estilo de la casa); el
`title` tarda ~1 s y no se ve igual en el celular.

## Se rompe si

SE ROMPE SI **se publica la web antes de pegar la función**: el botón existe y toda subida falla con «Could not find the function». Por eso la migración va
primero (ver «Cómo se despliega») y el check «SQL pegado» del PR lo exige.
SE ROMPE SI **`mover_interno` deja de recibir `p_token`**: la marca por talla se pierde y reintentar mueve dos veces; la prueba de idempotencia lo delata.
SE ROMPE SI **dos personas suben la misma prenda en el mismo segundo**: la segunda recibe «Solo queda N libre en el piso» en la talla afectada y **no se
mueve nada** de esa ventana (la base valida con las tallas ya bloqueadas, así que no puede quedar una subida y la otra no).
SE ROMPE SI **alguien cambia a mano la regla de «cuándo una talla pide reponer»** y no `calcularAccionHoy`: el aviso de la ventana volvería a decir otra
cosa que la fila. Por eso el aviso pregunta a esa función y no tiene umbrales propios.

## Cómo se despliega (producción: con el visto bueno de Felipe)

1. Pegar `supabase/migrations/20261001150000_retirar_del_piso.sql` **tal cual, en una vez**, en el SQL Editor de `cayla-dynamic`. Solo crea una función
   (+ `comment`, `revoke`, `grant`): no toma las tablas de `auth`/`storage` (ADR-0195), no lleva políticas ni `drop trigger`. Re-ejecutable.
2. Verificar: `select pg_get_function_identity_arguments(p.oid), md5(p.prosrc) from pg_proc p where p.pronamespace = 'retail'::regnamespace and
   p.proname = 'retirar_del_piso';` → una fila, «p_ubicacion_id uuid, p_items jsonb, p_nota text, p_token uuid».
3. Marcar la casilla «SQL pegado» del PR y **recién entonces** fusionar (publicar la web).
4. Refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`) y correr `pnpm datos:comparar`.

## Aplicación en producción (2026-10-01, Felipe: «sí, pégala en producción»)

1. **Antes (solo lectura):** la función no existía; sí existían `mover_interno` con `p_token` (una sola firma), `fn_bloquear_en_orden`,
   `fn_prenda_corta`, `fn_actor_persona_id(boolean)`, `fn_ve_modulo`, `fn_puede_operar_ubicacion`, la tabla `movimientos_internos_intentos` y el
   módulo `bajada_piso`; tres tiendas separan piso y almacén.
2. **Ensayo** en una transacción que termina en error a propósito (todo se revirtió: la función siguió sin existir y ninguna fila llevó la nota
   del ensayo), con la sesión de un **Admin** —producción exige responsable, `fn_exige_responsable()`; un líder que no es Admin recibe «Elige quién
   hace esta operación», como corresponde— y datos reales de Tienda TRU: sin marca → `retiro_sin_token`; una línea que alcanza más otra que pide
   99 → `retiro_sin_alcance` y **0 movimientos nuevos**; el caso bueno movió 2 tallas piso → almacén (piso 2→1 y 2→1, almacén +1 y +1) con 2 filas
   `traslado`/`movimiento_interno` y su nota; el reintento con la misma marca (otro orden) → `ya_registrada = true` sin mover nada.
3. **Aplicada** con el texto exacto del archivo (`apply_migration`, nombre `retirar_del_piso`).
4. **Verificada en el catálogo:** una sola firma `p_ubicacion_id uuid, p_items jsonb, p_nota text, p_token uuid`; `md5(prosrc)` =
   `2cab85b29c32d45f511e27f33b5eea25`, **idéntico al calculado del archivo**; `anon` no ejecuta y `authenticated` sí; `security definer`;
   `search_path = retail, public, extensions`; comentario puesto. No se llamó a la función de verdad en producción: ningún cambio real de stock.
5. **Lo que sigue (no hecho aquí):** fusionar el PR (publica la web) y refrescar el volcado `docs/datos/generado/` (la función entra al diccionario
   cuando se refresque) con `pnpm datos:comparar`.

## Cómo se verificó

- **Base:** `pnpm pruebas:retirar-del-piso` (**28 casos**, cada uno en ROLLBACK, enchufada al CI): una sola firma y permisos; módulo y tienda; firma de la
  terminal con responsable presente / ausente / sin responsable; todo o nada (dos líneas imposibles no suben ni la que alcanzaba, detalle en JSON);
  lo apartado no se sube; la fila es idéntica a la de `mover_entre_piso_y_almacen`; talla archivada con prendas SÍ sube; idempotencia (otro orden,
  piso en cero, otra cantidad rechazada, marca de un intento fallido libre); lista vacía, línea inválida, nota larga, más de 300 tallas, el Taller.
  `pnpm pruebas:una-sola-firma`: 689 funciones, cada una con una sola.
- **Web:** `lib/retiro-reglas.test.ts` (16; la primera fija el nombre y los parámetros de la RPC contra el SQL de la migración) y
  `lib/reponer-prenda-reglas.test.ts` (15). Suite completa: **288 archivos en verde**, `tsc` y eslint sin errores nuevos.
- **Navegador** (localhost:3010, base local con foto previa restaurada al final: «idéntica, 136 tablas»): tooltip «Ver detalle» al pasar el mouse;
  Reponer S 2 + M 3, luego «Subir a almacén» S 1 + M 3 con la nota «Fin de temporada» → aviso «4 prendas subidas al almacén · S 1 · M 3»; en la base,
  2 filas piso → almacén con esa nota; el aviso ámbar «Existencias va a pedir bajar de nuevo…» sale cuando la M quedaría en cero. Rechazo: con la S
  vaciada por debajo, «No se subió nada: revisa las tallas marcadas» y «Ya no queda nada libre en el piso», con las cifras releídas. 375 px: los botones
  bajan a dos renglones, sin desborde horizontal.
- **No probado:** con una cuenta no administradora (en local se vio «Eres admin»); el corte de red de esta ventana en el navegador (la lógica es la de
  «Reponer», que sí se probó, y la idempotencia de la base está en las pruebas SQL); en producción hasta pegar el SQL y fusionar.
