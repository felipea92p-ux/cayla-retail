# ADR-0384 — El precio 0 solo vale en Empaque, también en la base

- **Fecha:** 2026-10-12 · **Estado:** construido, verificado en local y **SQL EN PRODUCCIÓN desde el 2026-10-12** (una sola parte:
  `20261012190000_precio_cero_solo_empaque.sql`, pegada con el OK puntual de Felipe tras un ensayo que se deshizo; huellas idénticas a las de
  la base local probada). La web se publica al fusionar el PR #982.
- **Numeración:** se escribió como ADR-0380 (ya lo usaba el PR #968), pasó a 0381 (lo reservó el PR #979, el de las reservas de números) y quedó en
  **0384**, reservado con la etiqueta `reserva/adr-0384` antes de publicarse (0382 y 0383 también estaban tomados). El `comment on function` de la migración no lleva número de ADR, a propósito: va a producción.
- **Pedido:** una revisión marcó, como urgente, que «una prenda con precio S/ 0 se puede aprobar, crear y vender» y pidió el OK de Felipe porque
  toca precios, el candado de venta y una decisión previa suya. Felipe lo verificó conmigo y dio el OK: «hazlo en una rama como recomiendas».

## El problema (código y base, 2026-10-12)

La regla ya estaba decidida: **«el 0 vale solo en una categoría cuya familia está fuera de los motores»** (Felipe, 2026-10-11, ADR-0377). Pero vivía
en UNA pantalla, Editar producto (`precioValido`), y en ninguna otra puerta:

- **Nuevo producto.** El precio de arriba ya exigía mayor que 0 (`problemasAlta`), pero una **celda** de la tabla de precios con «0» pasaba: el
  formulario solo frenaba `< 0` y `crear_producto_con_variantes` aceptaba `0 o más`.
- **El conteo y el Taller.** `censo_crear_variante` deja proponer una prenda en 0 a propósito («déjalo en 0 y lo completa el Líder»); la muestra del
  Taller puede ir sin precio (ADR-0361). Bien: pero **aprobarla** en «Por revisar» no miraba el precio (la hoja decía «Sin precio» y dejaba aprobar).
- **La caja.** `registrar_venta` solo comparaba el precio que manda la caja con el del catálogo: 0 = 0 pasaba. Un ticket con SOLO esa prenda no se
  podía cobrar (total 0), pero **junto a otra prenda salía a S/ 0.00, descontaba stock y no se declaraba a SUNAT**: `itemsParaLucode` salta toda
  línea de precio 0, pensada para la bolsa de obsequio.
- **Editar producto** frenaba el 0 en la pantalla, pero `catalogo_actualizar_producto` lo aceptaba.

En producción, ese día, la única variante activa en 0 era la Bolsa de Obsequio (Empaque): todavía no había daño. Y **«Por revisar» no es una puerta
de venta**: una prenda pendiente se vende igual (ninguna función de venta mira `estado_alta`), y la que crea en Nuevo producto alguien que edita el
catálogo nace aprobada. Por eso el candado que importa es el de la venta.

## Decisión

1. **Una regla, un lugar: `retail.fn_categoria_admite_precio_cero(categoría)`.** Sí solo si la familia está fuera de los motores
   (`not fn_categoria_entra_a_motores`); sin categoría o sin dato, **no**: lo que no sabemos qué es se trata como mercadería. Es la misma frontera
   que la de los motores, porque Felipe la definió así; si algún día se separan, se cambia esta función y nada más.
2. **La venta** (`registrar_venta`, `venta_sin_precio`): una prenda de mercadería con precio 0 no se vende. Se mira el precio que **se cobra**
   (`fn_precio_en_sede`: el de la tienda, si tiene). La variante centinela (Prenda sin registrar, pieza de liquidación) vale 0 en el catálogo y lleva
   su precio en la línea: queda fuera, por su id, igual que en el candado del precio cambiado. Sin esa excepción, cada «Prenda sin registrar» se
   habría rechazado: la centinela no tiene familia, y «sin dato» es mercadería.
3. **La aprobación** (`revisar_producto_censo`, `sin_precio`): no se aprueba una prenda con una variante ACTIVA en 0 fuera de Empaque. Proponerla en
   0 sigue pudiendo; rechazarla también. La hoja lo adelanta (`bloqueoDeAprobacion`), dice «No tiene precio» o «Tiene variantes en S/ 0» y lleva a la
   ficha con «Ponerle precio»; la fila de la cola lleva la misma insignia. **Ajusta el «Aprobar nunca se bloquea» del ADR-0371**, que se escribió para
   los candados del rechazo (órdenes, stock): esos siguen sin frenar una aprobación.
4. **El alta y la edición** (`crear_producto_con_variantes`, `catalogo_actualizar_producto`, `sin_precio`): una variante activa no nace ni queda en 0
   fuera de Empaque; una desactivada sí (no se vende). En la edición cuenta la categoría de ESE guardado. Nuevo producto sigue pidiendo **siempre**
   mayor que 0 en pantalla (ADR-0377): la base admite Empaque; la pantalla, más estricta, no. Una celda en 0 ahora bloquea crear con una frase que
   la nombra («Negro en M tiene el precio en 0 (tabla, pestaña Precios)…»), en «Falta» y en «Siguiente», y la celda lleva `aria-invalid`.
5. **La caja lo frena antes de la base** (`sinPrecioParaVender`, la misma `precioValido`): la prenda no entra al ticket y el aviso dice por qué y
   qué hacer; la cámara la marca «No entró · sin precio». Si la base lo rechaza igual (una pantalla vieja), `venta_sin_precio` se lee en palabras de
   tienda.

**Forma de la migración:** cuatro reemplazos ANCLADOS sobre la definición viva (ADR-0288) y una comprobación final; una sola parte (solo funciones,
sin `alter` ni políticas, ADR-0195); idempotente; sin `select … into` dentro de los textos. Antes de escribirla se comparó línea por línea la
`registrar_venta` de producción con la local (solo difiere un comentario) y las huellas de las otras tres (idénticas).

## Lo que se descartó

- **Un disparador en `variantes`** (un solo candado para todas las puertas): rompía dos caminos que usan el 0 a propósito —el conteo y la muestra del
  Taller, que cuando los hace un líder nacen aprobados— y toca el núcleo (principio 1). El candado sin excepciones de flujo es el de la venta.
- **Rechazar el 0 al proponer** (en `censo_crear_variante`): quitaba el «déjalo en 0 y lo completa el Líder» del conteo, que es una decisión de diseño.
- **Validar solo en la web:** es lo que había y por eso pasó (una pantalla nueva o vieja se salta la regla).

## Se rompe si…

- Una familia nueva queda **sin `familia` asignada** y vende algo a 0 a propósito: «sin dato» es mercadería y la venta se rechaza (a propósito).
- Otra función que vende o cobra precio de catálogo (hoy `registrar_venta`; mañana un canal online) se escribe sin preguntar
  `fn_categoria_admite_precio_cero`.
- Alguien redefine `registrar_venta` copiando un cuerpo anterior a esta migración (en vez de un reemplazo anclado): el candado desaparece en silencio.
  Lo vigilan `pnpm pruebas:registrar-venta` (el caso «venta_sin_precio») y `pnpm pruebas:precio-cero` (la comprobación de la migración).

## Verificación

- **Base local** (cada caso en su transacción con ROLLBACK): `pnpm pruebas:registrar-venta` 32/32 (4 casos nuevos: la prenda en 0 se rechaza aunque
  vaya con otra; la bolsa en 0 de una familia apagada se vende y descuenta stock; precio base 0 con precio de tienda se cobra al de la tienda; la
  Prenda sin registrar se sigue vendiendo), `pnpm pruebas:revisar-productos` (4 casos nuevos), `pnpm pruebas:precio-cero` (14, nueva, en el CI).
  **Antes del arreglo, los dos casos de regresión fallaban** (la prenda en 0 se vendía y se aprobaba). Las otras 42 suites que llaman a estas
  funciones: `redondeo-efectivo` y `club-registro-cartel` fallaban por el parche nuevo (miden la huella de `registrar_venta` deshaciendo los parches
  posteriores) hasta sumarlo a `scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs` (DESHACER/REHACER, comprobado al md5): ahora 90/90 y 38/38.
  Otras siete fallan en local **igual con y sin la migración** (A/B: se deshizo, se corrieron y se volvió a aplicar con las mismas huellas): datos
  del local (formato del documento de una clienta, un patrón no habilitado), migraciones de caja que el local no tiene y permisos de otras funciones;
  dos se niegan a correr fuera de una base desechable o de carga.
- **Web:** `tsc` limpio; vitest 429 archivos, 157 470 pruebas en verde (casos nuevos en `tabla-alta-reglas`, `alta-producto-guia`, `vender-reglas`, `escaner-reglas`,
  `error-escritura`, `revisar-productos-reglas`, con la paridad contra la migración).
- **Navegador, local** (con foto de la base antes y restaurada idéntica después): «Por revisar» muestra «No tiene precio» y la hoja de aprobar frena y
  lleva a la ficha; en Vender, escanear la prenda en 0 no la agrega y avisa (1440 px y 375 px); en Nuevo producto, un 0 en la celda Negro · M apaga
  «Crear producto» y la nombra, y al vaciarla vuelve «Todo listo».

## Pendiente

- ~~Pegar la migración en producción~~ **hecho el 2026-10-12**: ensayo con un error a propósito (Postgres deshizo todo y se comprobó), pegado por el
  conector de Supabase y verificado: las cinco huellas iguales a las del local, cada candado una vez, permisos de la regla (anon no,
  authenticated sí) y 0 variantes activas en S/ 0 que dejen de venderse.
- Refrescar el volcado y el diccionario (`pnpm datos:generar:produccion`) y `pnpm datos:comparar`.
- Cambios con una prenda nueva en S/ 0 (devuelve la diferencia al cliente): tarea aparte, toca dinero.
