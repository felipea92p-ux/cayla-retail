# ADR-0486 — Campañas por sede: un descuento que rige solo en las tiendas que se elijan

- **Fecha:** 2026-10-23 · **Estado:** aceptado (Felipe lo pidió el día del aniversario de CAYLA). Código en la rama
  `claude/campaigns-by-location-feab19`. **La migración `20261023162000_campanas_por_sede.sql` NO está en producción** hasta que Felipe
  la apruebe y se pegue; la web que la usa se publica después de pegarla.
- **Relacionados:** ADR-0107/0108 (el descuento de campaña y su verificación), ADR-0370 (precio propio por sede: el patrón de los
  reemplazos anclados), ADR-0095 (`sedes_permitidas`), ADR-0195 (políticas y deadlocks), ADR-0476 (la llave de las campañas),
  ADR-0481 (Catálogo ▸ Insignias).

## El problema

Una campaña (una etiqueta con descuento) regía en TODAS las tiendas. El 2026-10-23, aniversario de CAYLA, Felipe quiso el descuento solo en
Tienda Trujillo, en todas sus prendas. Dos cosas se lo impedían:

1. La campaña no sabía de sedes: `fn_campanas_por_variante` y `campanas_vigentes()` no recibían la tienda.
2. Para «todas las prendas» había que marcarlas una por una en «Prendas», y `etiquetar_variantes` rechaza más de 2 000 por lista
   («Son demasiadas prendas a la vez»). Marcar prenda por prenda nunca fue el camino: la campaña ya sabe llegar por categoría.

## Lo que se decidió

1. **Una campaña rige en todas las sedes o solo en las que se elijan.** «Todas las sedes» es lo de siempre; las campañas que ya existen
   no cambian. Se elige en la hoja «Configurar» de Catálogo ▸ Insignias ▸ Campañas (y en la misma hoja de Tienda web ▸ Campañas ▸ «Datos y
   prendas»), en un bloque «Dónde rige» con una píldora por tienda. Marcar todas las tiendas vuelve a «Todas las sedes» (así una tienda
   nueva no queda fuera de una campaña pensada para todas).
2. **En las demás tiendas se cobra el precio normal.** No es un candado: la prenda se sigue vendiendo en toda tienda, solo que el descuento
   cuenta en las elegidas.
3. **«Elegir todas» en las categorías** marca de un toque todas las categorías: así una campaña llega a todas las prendas sin contarlas ni
   marcarlas, y sin tope. Quien quiera dejar fuera una categoría (empaque, por ejemplo) la desmarca.

## Cómo se hizo

- **Tabla nueva `retail.campana_sedes (etiqueta_id, ubicacion_id)`**, una fila por campaña y tienda; **sin filas = todas las sedes**. RLS
  encendido y sin políticas (se lee y escribe solo por funciones `security definer`, ADR-0195). Descartado: una columna `uuid[]` en
  `etiquetas` (sin llave foránea a `ubicaciones` y un `alter table` sobre una tabla en uso) y reusar `sedes_permitidas` (esa PROHÍBE
  vender o trasladar la prenda en otra sede; aquí solo se limita el descuento).
- **Una sola regla:** `fn_campana_rige_en_sede(etiqueta, sede)`. **Sin sede (null) solo rigen las campañas de todas las sedes**: quien no
  sabe en qué tienda está nunca da un descuento que no le toca (falla hacia «precio normal», no hacia «regalo»).
- **`fn_campanas_en_sede(hoy, tolerancia, variantes, sede)`** es la consulta de siempre más la regla; `fn_campanas_por_variante` (tres
  argumentos) conserva su firma y la llama con sede null. `campanas_vigentes(sede)` es lo que lee la caja de cada tienda (una sola función, con la sede
  opcional: ver la actualización de abajo).
- **Reemplazos anclados de una llamada** (el patrón de ADR-0370) en lo que cobra o muestra el descuento: `registrar_venta` (2),
  `separar_prendas` (2), `editar_separacion` (1), `fn_tienda_precio_talla` (1) y `fn_club_avisos_pendientes` (1). Cada uno aborta sin tocar
  nada si el texto vivo no es el esperado. Descartado reescribir `registrar_venta` entera (42 mil caracteres con 40 parches encima).
- **Guardar:** `actualizar_campana_etiqueta_con_sedes` llama a `actualizar_campana_etiqueta` (con su permiso y sus validaciones) y guarda
  las sedes en la misma transacción. La ruta `/api/productos/etiquetas` la usa solo si la hoja manda `sedeIds`; si la hoja no ofreció
  sedes (una sola tienda, o la base sin la migración) no se toca lo que tiene la campaña. Leer: `campanas_sedes()`.
- **Web:** Vender, Apartados, `usePreciosEnVivo` y `<PreciosEnVivo />` leen `campanas_vigentes({ p_ubicacion_id })`; la hoja de
  configurar trae el bloque «Dónde rige» (`CampanaModal`) y su guía de foco lo tiene como campo opcional; el pase y la tarjeta dicen
  «Solo Tienda Trujillo».

## Orden al desplegar

Pegar la migración en producción PRIMERO y publicar la web DESPUÉS. Con la web vieja, la caja pregunta `campanas_vigentes()` sin sede: no ve
una campaña limitada a tiendas, y `registrar_venta` sí la exige en esa tienda (`venta_campana_omitida`) hasta que la caja se actualice (el aviso
«Hay una versión nueva» la recarga). Con ninguna campaña limitada, todo es idéntico a antes. La migración no lleva políticas ni `alter` sobre
tablas en uso: se pega de una vez.

## Lo que NO cubre (y queda en el backlog)

- **Catálogo «lo que cobra la caja hoy» y el reporte de campañas de Finanzas** preguntan por la campaña sin tienda: una campaña limitada a
  tiendas NO aparece ahí (nunca dicen un descuento que no rige en todas). ~~Etiquetas de precio impresas~~: desde el mismo día leen las
  campañas de la tienda donde se imprime (`fn_campanas_en_sede`, commit `1f0ca4cc0`).
- **El cambio de sedes no queda en Actividad.** Cambiar dónde rige un descuento cambia el precio en caja: debería dejar su línea firmada.
- **Quién cambia las sedes** es quien configura la campaña (`fn_puede_tocar_etiqueta`); no hay un permiso aparte.

## Verificado

`pnpm pruebas:campanas-por-sede` (17 casos, contra una copia de la base local con las migraciones al día): la regla y las lecturas, la venta en la
tienda de la campaña (se exige y se acepta) y en otra (precio normal pasa, el descuento se rechaza), el apartado, la tienda web, guardar sedes
(vacío = todas, el taller no es sede, quien no puede tocar la campaña no las cambia), el guardián de las cinco funciones y la migración dos
veces seguidas. En el navegador: la hoja con «Dónde rige» y «Elegir todas», guardar 20 % en las 42 categorías solo en Tienda Trujillo (117
prendas), y la RPC como la llama la web: Trujillo 117, Lima 0, sin sede 0. En producción solo se LEYÓ (sin escribir): el md5 de las dos
funciones que se reescriben coincide con el que espera la guarda y cada ancla aparece las veces esperadas en las cinco funciones vivas.

## Sin verificar

Producción (la migración no está pegada). Vender y Apartados en el navegador (cubiertos por la base y por tipos, no recorridos con una caja
abierta). La hoja a 375 px.

## Actualización 2026-10-23 (tarde) — `campanas_vigentes` con una sola firma, y las pruebas que deshacen parches

El CI del PR salió rojo en tres pruebas, las tres por esta obra y ninguna por la lógica de ventas:

- **`pruebas:una-sola-firma`** (ADR-0009): 20261023162000 dejó `campanas_vigentes()` y `campanas_vigentes(uuid)`, dos firmas con el mismo nombre; el repo no
  admite sobrecargas en `retail` (PostgREST puede no saber a cuál llamar). Corrección: **20261023170000** deja UNA, `campanas_vigentes(p_ubicacion_id uuid
  default null)`, y borra la de cero argumentos. La web nueva la llama con `{ p_ubicacion_id }` y la vieja sin argumentos: las dos resuelven, y sin sede sigue
  dando solo las campañas de todas las sedes. Se pegó en producción (verificado: una firma, 340 prendas con campaña igual que antes). La migración original no
  se editó: ya estaba pegada; su guarda pide `campanas_vigentes()` sin argumentos, así que solo va ANTES de la corrección.
- **`pruebas:redondeo-efectivo` y `pruebas:club-registro-cartel`**: comparan el texto de `registrar_venta` y de `fn_club_avisos_pendientes` con el de una migración
  vieja después de DESHACER los parches posteriores. Mis tres reemplazos anclados no estaban en esas listas. Se suman a `registrar-venta-antes-de-precio-sede.mjs`
  (`DESHACER_CAMPANAS_SEDE` / `REHACER_CAMPANAS_SEDE`, los más nuevos de `DESHACER_POSTERIORES` / `REHACER_POSTERIORES`) y a `ANCLADOS_AVISOS_SEDE` de
  `club_registro_cartel.mjs`. Lo que pide `/abrir-pr` en su paso 3 y yo no hice antes de abrir el PR.
- **Lo que enseña:** una migración que parcha una función de esa cadena se corre contra `pruebas:redondeo-efectivo`, `pruebas:club-registro-cartel` y
  `pruebas:una-sola-firma` ANTES de abrir el PR, no después.

## Actualización 2026-10-23 (tarde, urgente) — la caja leía solo las primeras 1.000 campañas

Con «Elegir todas» las categorías el Aniversario alcanzó **2.518 prendas en Tienda TRU** (antes de hoy, 340). La caja leía `campanas_vigentes(sede)` de una vez y
PostgREST corta cada respuesta en 1.000 filas sin error: **1.518 prendas llegaban a la caja sin campaña**. Síntoma en tienda: al escanear (también el QR de la
prenda), el ticket salía a precio de etiqueta, y el descuento a mano rebotaba con «ya tiene una campaña con igual o más descuento» porque `registrar_venta` sí la
veía. La base estaba bien; el error era de lectura (la causa que ADR-0192 y `leerTodas` ya documentaban para el catálogo y el stock).

- **Arreglo:** `lib/campanas-vigentes.ts` (`leerCampanasVigentes`) lee por páginas, en serie (`enParalelo: 1`, ~22 ms por página en producción), y lo usan Vender,
  Apartados, `usePreciosEnVivo` y `<PreciosEnVivo />`. Descartado: subir `max_rows` del proyecto (es de TODO el proyecto, compartido con Dynamic) y tocar la función de la base.
- **Candado:** `lib/campanas-vigentes.test.ts` falla si un archivo de `app/`, `components/` o `lib/` llama `.rpc("campanas_vigentes")` fuera del lector.
- **Lo que enseña:** toda lectura que crece con una decisión del negocio (una campaña «a todas las prendas») pasa por `leerTodas`, no por un `.rpc()` suelto.

## Actualización 2026-10-23 (noche) — el aviso «Imprimir sus etiquetas» sabe de tiendas

**El problema.** Al guardar una campaña, el aviso de reimprimir (ADR-0180, actividad 5 de ADR-0441) salía de `prendasQueCambianDePrecioHoy`,
que no conocía las tiendas. Cambiar solo «Dónde rige» (de todas las sedes a solo Tienda Trujillo) no lo hacía salir, aunque las etiquetas de
papel con descuento de las otras tiendas ya no valían. Y la impresión sale con el precio de la sede de quien la abre (la de la cabecera): un
botón «Imprimir» desde Trujillo habría sacado las mismas etiquetas de siempre.

**Lo que decidió Felipe (2026-10-23):** el aviso **nombra las tiendas** donde el papel quedó viejo. Si la sede de quien guarda es una de
ellas, el botón imprime las suyas («Imprimir las de Tienda Lima»); si no, no hay botón y el aviso pide imprimirlas allá («Imprímelas en esa
tienda»). Descartadas: mirar solo la tienda de quien guarda (el papel viejo de las demás pasaba sin aviso) y dejar una tarea en el Inicio de
cada tienda afectada (necesita una tabla nueva; queda como idea).

**Cómo.** `prendasQueCambianDePrecioHoy` (`apps/web/lib/etiqueta-campana.ts`) compara el descuento de hoy **tienda por tienda**, con la regla
de `fn_campana_rige_en_sede` escrita igual en TypeScript (`rigeEnSede`: sin tiendas, todas; sin sede, solo la de todas). Devuelve cuántas
prendas cambian en alguna tienda, en cuáles (solo si el cambio no es el mismo en todas: otro % de una campaña de todas las sedes sigue sin
lista) y lo que se imprime desde la sede de la cabecera. `avisoReimprimir` arma la frase. `CampanaModal` recibe `sedeActualId`
(`persona.ubicacionId`, la misma sede con la que imprime `/etiquetas-de-precio`) desde Insignias y desde Tienda web ▸ Campañas. Sin la
migración (sin tiendas conocidas) todo es como antes. Sin cambios en la base.

**Verificado.** 12 casos nuevos en `etiqueta-campana.test.ts` (solo cambian las tiendas, se suma una tienda, sin tiendas = todas, otro % de
una campaña limitada, cambio distinto en cada tienda, sin tiendas conocidas). En el navegador, en local con 20261023162000 y 170000 aplicadas
(con el OK de Felipe), Halloween al 20 % en Faldas: de todas a solo Trujillo guardando desde Tienda Lima, «Cambió el precio en caja de 8
prendas en Tienda Lima… Imprimir las de Tienda Lima», que abre las etiquetas de Lima a S/ 74.90 (precio normal); de vuelta a todas guardando
desde Tienda Trujillo, «… en Tienda Lima… Imprímelas en esa tienda», sin botón. Los datos de la prueba se restauraron (`estado.mjs`).

**Lo que no cubre.** «Prendas» (marcar a mano, `prendasQueCambianAlEtiquetar`) y Editar producto siguen sin mirar las tiendas: con una campaña
limitada, su aviso puede ofrecer imprimir en una tienda donde el precio no cambió.
