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
  argumentos) conserva su firma y la llama con sede null. `campanas_vigentes(sede)` es lo que lee la caja de cada tienda; `campanas_vigentes()`
  delega con null.
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

- **Etiquetas de precio impresas, Catálogo «lo que cobra la caja hoy» y el reporte de campañas de Finanzas** preguntan por la campaña sin
  tienda: una campaña limitada a tiendas NO aparece ahí (nunca dicen un descuento que no rige en todas). Para imprimir las etiquetas de una
  campaña de una sola tienda hace falta una pantalla que sepa la tienda.
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
