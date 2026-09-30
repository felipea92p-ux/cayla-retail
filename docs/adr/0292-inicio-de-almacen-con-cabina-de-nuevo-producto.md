# ADR-0292 · Inicio de la cuenta de Almacén: la cabina de «Nuevo producto»

- **Fecha:** 2026-09-30 · **Estado:** implementado en local (escritorio, 768 px y 375 px) contra la base local y **migración aplicada en
  producción el 2026-09-30** (decisión 4); **falta probarlo con la terminal real de almacén** y con un alta real desde la web. La pantalla
  es solo web; la sigla de «dónde se registró» trae una migración (`20260930170000_producto_anota_donde_se_registro.sql`).
- **Decide:** Felipe, 2026-09-30, en cuatro rondas sobre la maqueta `docs/maquetas/inicio-almacen-2026-09/`: dirección A («Cabina»), color
  Papel, contenido «Nuevos a la vista» sin buscador, y «plásmalo tal cual en código, con todas las animaciones y la estética».
- **Complementa:** ADR-0225 (Inicio por rol: «Te toca», accesos y «Equipo de hoy»). No lo reemplaza: el Inicio de todas las demás cuentas
  sigue como estaba; la cuenta de almacén usa los mismos avisos, el mismo «Ajustar» y las mismas reglas de ADR-0225 con otra forma.

## Problema

El Inicio de «Almacén Trujillo» mostraba «Nada pendiente» y cuatro accesos. Faltaba lo que un almacén hace entre «llegó la mercadería» y
«está en el piso»: registrar lo nuevo (Nuevo producto estaba a tres clics), mirar si otra sede ya lo había registrado, recibir, subir al
piso y completar lo que quedó a medias.

## Decisión

**1. Quién es «la cuenta de almacén» se decide por lo que su rol VE y PUEDE, no por un nombre ni por el tipo de ubicación**
(`esPerfilAlmacen`, `lib/inicio-almacen-reglas.ts`). Es la que no ve el Punto de venta, ve Productos, **puede crear productos**
(`editarCatalogo`) y recibe (ve Recibir o Traslados). La terminal «Almacén Trujillo» vive en una TIENDA (`ubicacionTipo = "tienda"`), así
que el tipo de ubicación no sirve. El Taller queda fuera (tiene su propio Inicio). Si a un rol le falta cualquiera de las tres cosas, su
Inicio sigue siendo el de siempre: el botón central no le serviría.

**2. La pantalla** (`app/(app)/page.tsx` → `components/inicio-almacen/InicioAlmacen.tsx`), en un solo orden para todos los tamaños:
la cabina («Nuevo producto», su botón con la tecla **N**, «Lo último registrado» y «Sigue ahora» con «Después») → «Te toca» → «Nuevo en el
catálogo»; a la derecha desde ~940 px: Pulso del almacén, En camino, Reponer a piso hoy y Accesos. En celular, un botón fijo aparece al
salir la cabina de la pantalla (una acción de esta pantalla, no una barra de navegación: ADR-0206 sigue en pie).

**3. Cada cifra sale de la fuente que ya decide esa cifra, y cada bloque falla solo** (principio 9; `lib/inicio-almacen.ts`):

| Bloque | Fuente |
|---|---|
| Lo nuevo (hoy y ayer, día de Lima) | `productos` vigentes (activos, no de prueba, no rechazados) + `fn_nombres_personas` para quién lo dio de alta |
| «Ya hay N en tu sede» | `fn_existencias_productos` (`getExistenciasProductos`): la misma cifra que Existencias y el Catálogo (ADR-0270). Sin ella, la tarjeta no dice nada |
| Mercadería por recibir | `listarPorRecibir` con la sede (la misma lista de Recibir) |
| Reponer a piso, «En almacén» | `getExistencias` + `calcularAccionHoy` + `agruparPorPrenda`: la misma regla de la tarjeta de Existencias |
| En camino | `getTrasladosEnCurso` (`fecha_estimada_llegada`; el avance del trayecto se calcula) |
| Entraron / salieron hoy | `fn_movimientos_resumen_procesos` (`getResumenTienda`) |
| Fotos que faltan, «% con foto», por completar | conteos exactos sobre `productos` (`!inner` con `producto_fotos`; marca o proveedor nulos, ADR-0283) |

Lo que una cuenta no ve no se lee ni se dibuja (ADR-0161): un aviso nunca lleva a «Sin acceso». Lo que falló se dice («No se pudo leer»,
«Sin leer», «Reintentar»), nunca se dibuja como 0, y una cola sin leer no cuenta como «al día» ni queda detrás de «Ver más».

**4. Cada producto dice en qué sede se registró (Felipe, 2026-09-30: «necesito ver dónde fue registrado, si en AQP o en TRU, ya que
comparten el mismo catálogo global y solo se diferencian en inventario»).** El catálogo es UNO para todas las sedes y solo cambia el
inventario, así que `productos` no lleva sede y **no debe llevarla** (principio 1). Por eso la sección **nunca dice «de otras sedes»**: se
llama **«Nuevo en el catálogo»** (`TITULO_NUEVOS`) y cada producto lleva la **sigla de la sede desde la que se dio de alta** (`ChipSede`:
«TRU», «AQP», «Taller»; la de quien mira va rellena y dice «tu sede»), con un chip de filtro por sede. El dato no existía en ninguna
parte; se anota así:

- **Tabla aparte `retail.producto_origen`** (una fila por producto: `ubicacion_id`, `terminal_id`, `persona_id`, `registrado_at`), llenada
  por un **disparador `trg_producto_anota_origen`** sobre `productos`. Cubre toda forma de dar de alta un producto (las tres RPC de hoy, el
  censo por lotes y cualquier INSERT futuro) **sin reescribir ninguna**.
- **La sede sale de `fn_ubicacion_de_la_operacion()`**: la tienda de la terminal; o, para una persona, la sede de `x-ubicacion` (el mismo
  encabezado que ya manda la web) si puede operar en ella; o su sede de partida. Si nada la dice, la fila queda **sin sede**: se sabe *que*
  se registró, no *dónde*. Jamás se inventa.
- **Nunca frena un alta** (principio 9): anotar va en su propio bloque con `exception`; si falla, el producto se crea igual y queda un aviso
  en el log.
- **Se lee con `fn_producto_origen(uuid[])`** (`security definer`). La tabla tiene RLS encendido y **sin políticas** (una política nueva
  toma en exclusiva las 21 tablas de `auth` y `storage`: ADR-0195).
- **Sin historia:** los productos que ya existen no tienen origen y **no se les pone sigla** (no se adivina). Solo los que se registren después
  de aplicar la migración la tendrán.
- **Se degrada con gracia:** si la función no responde o todavía no está en la base, la pantalla se arma igual, sin siglas ni chips de
  sede (probado quitando la función en la base local).

Descartado, con su porqué: **(a) reescribir las tres RPC de alta** para que anoten la sede: los cuerpos vivos en producción no son los de ningún
archivo del repo (ADR-0283) y tocarlos era el riesgo grande; **(b) escribir `producto_creado` en `retail.actividad`** (ADR-0207): esa bitácora
alimenta la pantalla Actividad por módulo y obligaría a cambiarla, y esto es un dato del catálogo, no una línea de actividad; **(c) una columna
`sede_id` en `productos`**: toca el núcleo estable y sugiere que el producto es «de» una sede.

**Aplicada en producción el 2026-09-30 (Felipe: «prepara el script con su ensayo y, si todo sale bien, pega las migraciones necesarias»):**
proyecto `cayla-dynamic`, schema `retail`, como una sola parte sin políticas ni `alter` de tablas en uso (`apply_migration`, registrada como
`20260930163539 producto_anota_donde_se_registro`). Antes se ensayó el script `supabase/migrations/pegar-en-produccion-producto-origen-2026-09-30.sql`
contra los datos reales: corre la migración y 12 comprobaciones (altas de prueba como un admin real con la sede de AQP, de TRU y con un encabezado
roto; lectura; permisos de `authenticated` y `anon`) y **termina siempre en un error a propósito**, que deshace todo. **Primer ensayo: falló, y sin
dejar nada** (una sesión de persona que no es admin necesita un responsable presente con asistencia marcada, cosa que un ensayo no puede fingir;
se repitió con un admin). **Segundo ensayo: 12 de 12**, y producción quedó idéntica (sin tabla, 12 productos, `catalogo_version` sin tocar).
Verificado después de aplicar: RLS encendido y 0 políticas, disparador activo, 3 funciones, `authenticated` lee por `fn_producto_origen` y no la
tabla, `anon` no lee nada, 0 filas (sin historia). Lo vigila `pnpm pruebas:producto-origen` (14 comprobaciones, en el CI).
**Lo que queda:** el diccionario de `docs/datos/generado/` no la trae todavía (el volcado es del 2026-09-28: refrescarlo es una tarea aparte).

**5. Movimiento completo, con un solo bucle decorativo aislado.** Entrada escalonada (55 ms de desfase, una vez), aros y trazos que se llenan
al llegar a la vista, cifras que cuentan, foco de luz que sigue al mouse, inclinación de la tarjeta de producto, imán del botón
principal, un brillo que barre el botón al llegar, barrido de luz sobre cada foto, filtros que reacomodan las tarjetas con una
transición de vista y «Ver más» que se despliega sin medir alturas. Curva `--ease-cayla`, sin rebote. **Se aparta de ADR-0136 en una
sola cosa, y Felipe la aprobó:** la aurora de la cabina (dos manchas de luz que derivan, `.ia-aur`) es un bucle decorativo. Está aislada en el bloque «AMBIENTE» del final de
`app/estilos/inicio-almacen.css`: borrar ese bloque lo apaga sin tocar nada más. Siguen la regla de siempre las dos señales (el punto que late en lo urgente
y el aro del camión en camino). **`prefers-reduced-motion` apaga todo** (`@media` del mismo archivo; los gestos por mouse también se
ignoran).

## Lo que se aparta de ADR-0169 (Felipe lo aprobó al elegir la maqueta)

Una cuadrícula fina y un brillo suave de fondo en la cabina, sombras de elevación al pasar el mouse por las tarjetas de producto y los
accesos, y un degradado de luz sobre las fotos. Todo con tokens; ningún hex suelto. El rojo sigue siendo solo para lo urgente.

## Lo que quedó fuera a propósito

- **«Sincronizado hace N s»** de la maqueta: era de adorno (no hay sincronización en vivo que medir).
- **«Etiquetas por imprimir»** como aviso: no existe «pendientes de imprimir» en ninguna fuente. El acceso a Etiquetas de precio sí está.
- **Minigráfica de entradas** y **«Por preparar»** de En camino: sin datos reales (un traslado no tiene estado «por preparar»).
- **Ancho:** el Inicio sigue en `max-w-5xl` (64 rem) porque «/» no está en `SIN_TOPE_DE_ANCHO` del `AppShell`; se dibuja bien a ese ancho y
  se acomoda por contenedor (`@container`) hacia abajo. Quitar el tope para «/» afectaría a todas las cuentas: no se hizo.
- **Cuatro posibles avisos** que ADR-0225 lista «sin lectura todavía» (efectivo sin depositar, cierre de mes, impuestos, órdenes del taller,
  insumos bajo mínimo) siguen sin lectura: no son de almacén.

## Dependencias de producción a confirmar antes de publicar

- `fn_existencias_productos` (migración `20260929020000`) y `fn_movimientos_resumen_procesos` (`20260927153000`): **confirmadas en producción el
  2026-09-30**. Si alguna faltara, **no se rompería nada**: «Ya hay N en tu sede» no se dibuja y «Entraron / Salieron hoy» dice «No se pudo leer».
- «Fotos que faltan» lleva a `/productos` (la pantalla «Fotos que faltan», `/inventario/fotos`, no está en `main`: si aparece, se apunta ahí).
- Costo: el Inicio de almacén lee `getExistencias` (≈1 s para Trujillo, en paralelo con lo demás). Es el mismo costo que abrir Existencias.

## Cómo se verificó

- 55 pruebas nuevas en `lib/inicio-almacen-reglas.test.ts` (perfil, ventana de «hoy y ayer» en hora de Lima, «hace N», armado de tarjetas,
  título, ayuda y filtros por sede de registro, corte de «Te toca» con lo no leído, «Sigue ahora», avance del trayecto, accesos, fuentes de avisos). `tsc`,
  `eslint` y la batería completa de `apps/web` en verde, incluido el candado de ADR-0270 (`stock-una-sola-cifra.test.ts`).
- En el navegador, contra la base local y con la terminal «Almacén Trujillo» (rol `terminal_administrativa`): escritorio, 768 px y 375 px;
  tecla N; filtros y flechas del carrusel; «Ver más»; «Ajustar» (aparecen los avisos nuevos de Inventario y Catálogo); botón fijo de celular;
  y los tres estados —lleno, «Todo al día» y «Falla de lectura»— con un interruptor temporal que ya se retiró. Sin errores de consola ni de servidor.
- La sigla de sede: `pnpm pruebas:producto-origen` (terminal, `x-ubicacion`, sede de partida, sin sesión, fallo al anotar, permisos, borrado en
  cascada, migración repetida) y en el navegador con orígenes sembrados en local (TRU y AQP): sigla rellena para «tu sede», chips y filtros por
  sede, 375 px sin desborde, y la degradación sin la función.
- **No verificado:** Safari y Firefox; contraste medido de la cabina (se calculó con la fórmula WCAG sobre los tokens: Papel 16.4:1 en texto, 5.3:1
  en texto secundario); la terminal real de producción; `prefers-reduced-motion` en un navegador (solo el CSS).
