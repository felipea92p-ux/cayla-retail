## 2026-09-30 (Maquetas del Inicio de la cuenta de Almacén: Cabina, Recorrido y Radar)

Qué hice: tres maquetas del Inicio de «Almacén Trujillo» en `docs/maquetas/inicio-almacen-2026-09/` (una página con selector de
dirección, ancho, escenario y movimiento). Suman lo que Felipe pidió: atajo muy notorio a Nuevo producto (`N` en escritorio, botón fijo
en celular) y «Nuevo en otras sedes» (lo registrado en AQP, LIM y el Taller en los últimos 2 días, con foto o «Sin foto», precio y cuánto
hay ya en TRU). Suman también «Sigue ahora», mercadería por recibir, traslados en camino con barra de trayecto, reponer a piso, fotos que
faltan y productos por completar. Solo maqueta: no toca `page.tsx`, ni la base, ni ningún RPC.

Por qué así: un almacén trabaja en recorrido (llega, se registra, se prepara, se verifica) y el Inicio actual solo cubría traslados y
conteo. Recomiendo la A («Cabina»): es la más barata y mantiene el orden de ADR-0225. La B reagrupa los avisos en cuatro etapas y la C dibuja
la red de sedes; ninguna cambia el modelo de datos, pero «Nuevo en otras sedes» sí necesita saber en qué sede se dio de alta un producto, y hoy
`productos` no lo guarda ni las RPC de alta escriben en `actividad`. Lo dejé como decisión de Felipe con tres opciones (README, «Decisión de
esquema»); la recomendada es anotar `producto_creado` en `retail.actividad` desde las tres puertas de alta.

Felipe se lleva: abrir `inicio-almacen.html` y probar las tres direcciones en Escritorio, Tablet y Celular, y el escenario «Falla de
lectura»; elegir dirección, decidir la opción de esquema y decir qué se queda de lo que se aparta del sistema (panel oscuro, bucles ambientales,
sombra al levantar tarjetas; «Sobrio» los quita). Verificado en el navegador a 1520, 900 y 390 px, sin errores de consola; no se probó en Safari
ni en Firefox. Ojo: «Fotos que faltan» (`/inventario/fotos`) no está en `main` ni en las ramas remotas que revisé.

## 2026-09-30 (Cabina final del Inicio de Almacén)

Qué hice: Felipe eligió la dirección A con movimiento completo y el color **Papel** (`papel` con borde `sand`, texto `tinta`, 16.4:1). Tras ver seis contenidos posibles para la
cabina se quedó con «Nuevos a la vista» **sin el buscador**. La maqueta queda con una sola cabina: «Nuevo producto» con su botón «Crear producto» (tecla `N`), debajo lo último de
otras sedes (tres filas y «Ver los 6»), y a la derecha «Sigue ahora» con «Después» (las tres tareas siguientes) y el avance del día. Las variantes descartadas se quitaron del HTML.

Por qué así: el buscador sumaba una pieza que el ERP ya tiene (`/buscar`) y alargaba la cabina; sin él, la lista de lo último de otras sedes queda bajo el botón y cumple lo mismo: ver
antes de crear otro igual. «Después» reemplazó la línea suelta de «Después: …» para que «Sigue ahora» llene su tarjeta: el hueco libre mide 12 px en «Día movido», «Todo al día» y «Falla de lectura».

Felipe se lleva: abrir `inicio-almacen.html` (la dirección A ya abre con la cabina final) y revisarla en Escritorio, Tablet y Celular. La lista de la cabina repite las tres primeras de «Nuevo en otras sedes»,
más abajo: si estorba, se quita una de las dos. Verificado en el navegador, 27 combinaciones sin desbordes y sin errores de consola; no se probó en Safari ni en Firefox.

## 2026-09-30 (El Inicio de Almacén, construido en la app: ADR-0292)

Qué hice: llevé la maqueta al código real. La cuenta de almacén (la que no vende, ve Productos, puede crear productos y recibe: `esPerfilAlmacen`)
ahora ve una cabina «Nuevo producto» con su botón y la tecla N, «Lo último registrado», «Sigue ahora» con «Después», «Te toca» con cuatro avisos
nuevos (mercadería por recibir, reponer a piso, fotos que faltan, productos por completar), «Nuevo en el catálogo» con filtros y carrusel, y a la derecha
el pulso del almacén, lo que viene en camino, el piso que pide reposición y los accesos; en celular, un botón fijo. Todas las animaciones de la
maqueta (entrada escalonada, aros y trazos que se llenan, cifras que cuentan, foco de luz, inclinación, imán, filtros con transición de vista). Nuevos:
`components/inicio-almacen/`, `lib/inicio-almacen.ts`, `lib/inicio-almacen-reglas.ts` (+47 pruebas) y `app/estilos/inicio-almacen.css`; `page.tsx` e
`inicio-avisos.ts` crecen sin cambiar el Inicio de las demás cuentas.

Por qué así: cada cifra sale de la fuente que ya decide esa cifra (Existencias, Recibir, Traslados, Movimientos, `fn_existencias_productos`) y cada
bloque falla solo. «Cuánto hay en tu sede» primero lo leí de la tabla `stock` y la batería me paró: el candado de ADR-0270 exige `fn_existencias_productos`;
cambié a eso. La sede de origen de un producto no existe en la base, así que la pantalla dice «Nuevo en el catálogo» y no afirma «otras sedes»
hasta que se decida cómo guardarla. Con `prefers-reduced-motion` todo el movimiento se apaga; la única animación en bucle decorativa (la aurora de la cabina) está
aislada para poder borrarla.

Felipe se lleva: abrir `/` con la terminal de almacén. En mi base local creé la terminal «Almacén Trujillo» (correo `almacen.trujillo@cayla.local`, con la clave de desarrollo del `seed.sql`,
rol `terminal_administrativa`) y cinco productos «(prueba)» de hoy y ayer, tres con foto; el servidor de esta rama corre en el puerto 3070 con `apps/web/.env.local`
apuntando a la base local. Decidir: la sede de origen (README de la maqueta), si se quiere quitar el tope de ancho del Inicio, y confirmar que
`fn_existencias_productos` y `fn_movimientos_resumen_procesos` están en producción. Verificado en escritorio, 768 y 375 px, con los tres estados (lleno, todo al día,
falla de lectura); `tsc`, `eslint` y la batería completa (254 archivos) en verde. No se probó en Safari ni en Firefox ni con la terminal real.

## 2026-09-30 (Dónde se registró cada producto: `producto_origen`, ADR-0292 decisión 4)

Qué hice: Felipe pidió ver en qué sede (AQP o TRU) se registró cada producto nuevo, porque las sedes comparten el mismo catálogo global y solo
cambia el inventario. Cada producto de «Lo último registrado» y de «Nuevo en el catálogo» lleva ahora la sigla de su sede (la de quien mira, rellena),
y hay un chip de filtro por sede. Para tener el dato: la migración `20260930170000_producto_anota_donde_se_registro.sql` crea `retail.producto_origen`,
un disparador sobre `productos` que la llena (sede de la terminal, o `x-ubicacion`, o la sede de partida) y `fn_producto_origen(uuid[])` para leerla.
Nuevos: `scripts/pruebas/producto_origen.mjs` (`pnpm pruebas:producto-origen`, también en el CI), `components/inicio-almacen/ChipSede.tsx`; cambian
`lib/inicio-almacen.ts`, `lib/inicio-almacen-reglas.ts` (+8 pruebas) y las dos piezas que pintaban la sede.

Por qué así: guardar la sede en `productos` o reescribir las tres RPC de alta eran los dos caminos obvios y los dos dolían (el núcleo estable; cuerpos
vivos en producción que no coinciden con ningún archivo). Un disparador en una tabla aparte cubre toda forma de dar de alta un producto, incluido el censo
por lotes, sin tocar ninguna función, y nunca frena un alta. La sigla sale con la misma regla de nombres que las terminales (`Tienda TRU` en producción,
`Tienda Trujillo` en local: los dos dan TRU). Sin historia: no se adivina la sede de los productos que ya existen.

Felipe se lleva: **la migración necesitaba su OK para producción** (una sola parte, sin políticas; se ensaya antes; ya aplicada: ver la entrada siguiente). Mientras
tanto la pantalla funciona igual, sin siglas (probado quitando la función en mi base local). En mi base local ya está aplicada y hay cinco productos
«(prueba)» con origen en Lima y Trujillo. Verificado: la prueba de base (14 comprobaciones), 55 pruebas de reglas, la batería completa (254 archivos, 153 310
pruebas), `tsc`, `eslint`, y en el navegador (escritorio y 375 px, filtros TRU/AQP con una sede Arequipa temporal que ya borré). No probado con producción ni con una alta real desde la web.

## 2026-09-30 (Aplicada en producción: `producto_origen`)

Qué hice: Felipe pidió preparar el script de producción con su ensayo y, si todo salía bien, aplicar. Armé
`supabase/migrations/pegar-en-produccion-producto-origen-2026-09-30.sql`: la migración completa más 12 comprobaciones que dan de alta productos de
prueba como un admin real (con la sede de AQP, la de TRU y un encabezado roto), leen con `fn_producto_origen` y prueban los permisos de la web y de
`anon`, y que **termina siempre en un error a propósito** para deshacerlo todo. Lo ensayé primero en mi base local (falló una vez por mi propio script:
bajo el rol `authenticated` no podía anotar resultados) y luego en producción. **El primer ensayo en producción falló sin dejar nada:** producción exige
un responsable presente para dar de alta desde una sesión de persona, y mi cuenta de prueba no era admin. Con un admin salió **12 de 12**, y antes de aplicar
comprobé que producción seguía igual (sin tabla, 12 productos). Apliqué la migración (`cayla-dynamic`, `retail`; registrada `20260930163539`) y la verifiqué.

Por qué así: un ensayo que termina en error garantiza el rollback aunque alguien edite el final, y el mensaje del error trae el informe (un `rollback`
explícito no devuelve nada que leer). Producción ya tenía `fn_existencias_productos` y `fn_movimientos_resumen_procesos`, así que esta era la única migración
que hacía falta para la pantalla; no toqué nada más.

Felipe se lleva: la sigla de sede ya funciona en producción para los productos que se registren desde ahora (los 12 actuales salen sin sigla, a propósito), pero la
web de esta rama aún no está desplegada ni hay commit. Pendiente: probar un alta real de TRU y otra de AQP con el despliegue, y refrescar el diccionario de datos (el
volcado es del 28 de setiembre; `pnpm datos:comparar` seguirá marcando `fn_producto_origen` hasta entonces). No se probó una alta real desde la web.

## 2026-09-30 (CI del PR: la purga y `eliminar_producto` no conocían `producto_origen`)

Qué hice: el check obligatorio «Pruebas de RPC contra Postgres» falló en dos pasos, `pruebas:purgar-producto` (88 pruebas, todas por lo mismo) y `pruebas:eliminar-producto`
(una). Causa: dos candados del repo recorren el esquema y se niegan a seguir ante una tabla con llave a `productos` que no conocen, y `producto_origen` era nueva.
Arreglo en tres archivos: `scripts/purga/purgar-producto-de-prueba.sql` (la tabla entra como hoja del producto y se borra con él), `scripts/purga/restaurar-purga.sql`
(se devuelve justo después de `productos`) y `scripts/pruebas/eliminar_producto.mjs` (clasificada como «suya»: se va con la ficha por su cascada). No toca producción ni la
migración: la purga es un script, no una función viva.

Por qué así: la purga respalda cada fila antes de borrar y restaura fila por fila, así que `producto_origen` tenía que estar en las dos puntas, no solo en el borrado; `eliminar_producto`
no necesita cambio en la base porque la llave ya cascadea. Dos cosas que aprendí: mi base local iba **33 migraciones** atrás de `main` y por eso no pude ver este fallo antes (solo
corrí mis pruebas y las de pantalla); y `supabase migration up --db-url … --include-all` la dejó al día sin errores (`--include-all` porque una migración vieja, `20260928120330`, nunca se había aplicado).

Felipe se lleva: con la base local al día y el conteo abierto de Tienda Lima apartado un momento (lo devolví a «abierto»), `purgar-producto` pasa 88 de 88, `eliminar-producto` 35 de 35,
`eliminar-producto-con-historia` 52 de 52 y `producto-origen` 14 de 14. Mi base local quedó sin migraciones pendientes (última `20261001120000`), con mis datos de prueba intactos; antes de migrar
guardé un respaldo del schema `retail` en el scratchpad de la sesión. Ojo para quien corra la purga en local: la escena necesita que Tienda Lima no tenga un conteo abierto.

## 2026-09-30 (Con datos reales los productos recientes no traían sigla: relleno preparado, sin aplicar)

Qué hice: Felipe abrió la pantalla con datos reales y ningún producto mostraba TRU o AQP. No era un fallo de código: todos se registraron **antes** de que aplicara la migración (`BOD-0008` a las
16:22 UTC, `BOD-0007` a las 16:17, `CON-0004` a las 15:17; la migración entró a las 16:35 y `producto_origen` tiene 0 filas). Como la pantalla muestra «hoy y ayer», justo los productos anteriores a la
tabla son los que se ven. Miré producción (solo lectura) y hay evidencia objetiva para reconstruir la sede: el alta con stock escribe la entrada `carga_inicial` en la misma transacción que el producto, y los
11 productos de los últimos 3 días la tienen en el instante exacto del alta, en una sola sede (TRU). Escribí `supabase/migrations/pegar-en-produccion-producto-origen-desde-la-carga-inicial-2026-09-30.sql`
con una regla estricta (una sola sede, dentro de 5 segundos del alta; ante la duda, sin sigla), la probé en local (`pnpm pruebas:producto-origen`: sede reconstruida, ambigua, tardía, sin carga, sin pisar una fila
existente, dos corridas) y la ensayé en producción con un error a propósito: insertaría 11 filas, todas Tienda TRU.

Por qué así: no usé la sede de la persona porque una líder puede operar en otra distinta de la suya; la carga inicial es el registro de dónde se hizo la operación. **No lo apliqué:** escribir datos en producción es una
acción distinta de aplicar la migración y no estaba autorizada; queda como «POR PEGAR» con el OK de Felipe.

Felipe se lleva: decir «sí» y lo pego (una sola parte, solo inserta 11 filas en `producto_origen`; al instante la pantalla muestra TRU en los 11, sin desplegar). Los productos que se registren desde ahora traen su sede por el
disparador; el primer alta real lo confirma (la web manda `x-ubicacion` en cada operación firmada). Un admin que registre sin elegir responsable puede quedar «sin sede»: no es un error, se sabe que se registró y no dónde.
