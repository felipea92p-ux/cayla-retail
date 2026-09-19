# ADR-0127 — Movimientos: qué cambió en el stock de la sede y qué proceso lo originó

**Fecha:** 2026-09-19
**Numeración:** nació como ADR-0126; el PR #178 (`claude/recibir-cerrar-huecos`) ya lo reclamaba, así que pasó a 0127.
**Estado:** **Migración APLICADA en producción el 2026-09-19** (PR #179, rama
`claude/movimientos-simplificados`), con la autorización de Felipe, **antes** de fusionar el front.
`20260919155000_movimientos_referencias_y_busqueda.sql` se ensayó primero entera dentro de una
transacción revertida contra datos reales de producción y después se aplicó con el texto exacto del
archivo (Supabase `apply_migration`, nombre `movimientos_referencias_y_busqueda`). Verificado después de
aplicar: una sola firma por función, `anon` sin EXECUTE, permisos idénticos a los de la versión anterior
(`postgres`, `authenticated`), comentarios puestos, las dos columnas nuevas al final y `md5(prosrc)` de las
cuatro funciones **idéntico al del archivo**. Detalle del ensayo en «Consecuencias».
**Enmienda a:** ADR-0050 (Movimientos en V2). La pantalla, el ledger y las categorías de ADR-0050
siguen igual; esto cambia qué se ve, qué se puede buscar y de dónde sale el número de un traslado.
**Afecta:** `retail.fn_movimientos` (mismas 12 entradas, +2 columnas al final; `drop` explícito de la
firma anterior), `retail.fn_movimientos_resumen` (misma firma), `retail.fn_movimientos_busqueda` y
`retail.fn_movimientos_de_comprobante` (nuevas), `apps/web/lib/movimientos-{reglas,v2}.ts`,
`lib/traslados-reglas.ts` (`coincideBusqueda`), `FiltrosMovimientos.tsx`, `MovimientosLista.tsx`,
`MovimientoDetalle.tsx`, `HistorialProductoPanel.tsx` (solo el nombre del proceso), `ui/Tabla.tsx`
(una prop aditiva), `packages/database/src/types.ts` (solo esa entrada),
`scripts/pruebas/fn_movimientos_referencias.mjs` y el job `pruebas-postgres` de CI. **Ninguna tabla
cambia de forma, ninguna escritura cambia, no se crea ningún movimiento.**

## Contexto

Felipe pidió simplificar `/inventario/movimientos` sin tocar la arquitectura: la pantalla tiene que
decir **directamente qué cambió en el stock de la sede elegida y qué proceso lo originó**, y dejar de
mezclar eso con quién lo hizo. Antes de tocar nada se leyó la implementación real (Movimientos,
Traslados y las llaves de `movimientos` hacia cada proceso) y se verificó en **producción, solo
lectura**, qué identificadores existen de verdad:

- `transferencias.numero` y `conteos.numero` son números corridos reales (secuencia de la base).
- **Ventas, devoluciones, cambios, producciones, lotes y envíos no tienen número propio.** Una venta
  se identifica por su comprobante (`comprobantes.serie` + `numero`); una recepción, por la guía
  (`lotes.numero_guia`) o la factura de compra (`compras.serie/numero`).
- `/inventario/traslados/[id]` y `/inventario/conteo/[id]` ya existen; `movimientos` llega a su
  traslado por `transferencia_item_id` (salida) o `transferencia_recepcion_id` (llegada), y a su
  conteo por `conteo_item_id`.

La pantalla anterior tenía seis controles de filtro (búsqueda, tipo, proceso, sububicación, persona,
rango de fechas), una columna «Responsable» y ninguna forma de llegar del movimiento a su proceso ni
de escribir «Traslado 24» y encontrarlo.

## Decisiones

1. **La columna «Referencia» muestra solo lo que la base ya guarda; no se inventa numeración.**
   DECIDÍ: `Traslado N` y `Conteo N` (números reales, con enlace a su detalle); una venta, su
   devolución y su cambio se identifican por el comprobante de la venta (`Boleta B001-000184`);
   una recepción, por `Factura F001-000210` (con la guía y el proveedor en una segunda línea) o por
   la guía; el resto (carga inicial, ajuste suelto, producción, reposición interna) deja la celda
   vacía en vez de un «—» a la fuerza.
   DESCARTÉ: mostrar «Venta 184», «Recepción 31», «Devolución 7» como en el pedido, porque esas
   tablas no tienen ese número. Agregarlo es una decisión de negocio, no de pantalla: ¿el número de
   venta es el de la boleta?, ¿uno por sede o global?, ¿qué número lleva una venta sin comprobante?
   Y es una migración de cuatro tablas con backfill. Con tres tiendas y un taller el comprobante ya
   identifica la venta. **Queda como decisión abierta de Felipe** (BACKLOG).
   SE ROMPE SI la operación empieza a hablar de «la venta 184» en voz alta (WhatsApp entre sedes)
   y ese número no existe en ninguna pantalla: ahí conviene la numeración corrida por sede.

2. **La búsqueda por proceso vive en Postgres, en una sola función que comparten la lista y las tarjetas.**
   DECIDÍ: `fn_movimientos_busqueda(texto)` devuelve prendas (`variante_ids`) y/o movimientos
   concretos (`movimiento_ids`). Gramática: **palabra + número** («traslado 24», «conteo 12», «venta
   184», «boleta 184», con o sin `#`, `n°`, `nro`, ceros a la izquierda) es una referencia
   inequívoca → solo los movimientos de ese proceso; **serie + número** («B001-000184», «F001-210»,
   «T001-34», con o sin la palabra delante) → los movimientos de ese documento **y además** las
   prendas cuyo código se le parezca (se suman, no se esconden); **lo demás** → por prenda, como
   siempre. Una boleta trae los movimientos de su venta, de su devolución y de su cambio (las tres
   vías por las que un movimiento llega a una venta).
   DESCARTÉ: resolverlo en TypeScript con dos consultas (buscar el traslado, luego filtrar por
   su id) porque la lista y el resumen tendrían dos caminos y el cursor de paginado necesita el
   filtro dentro de la misma consulta; y guardar un texto de referencia en `movimientos`
   (denormalizar) porque duplicaría el dato de otra tabla y dejaría de ser una sola fuente de verdad.
   SE ROMPE SI `movimientos` pasa de ~1 millón de filas (las vías por `transferencia_item_id`,
   `conteo_item_id`, `devolucion_item_id` y `cambio_id` no tienen índice propio: hoy ~460 filas en
   producción, con 300 movimientos al día tardaría años en importar), o si a `ventas` se le agrega un
   número propio: entonces «venta 184» tendría que buscar ese y no el del comprobante.

3. **A la vista solo lo que se usa todos los días.**
   DECIDÍ: buscador (`Prenda, código, barras o referencia…`), Tipo (`Todos · Entradas · Salidas ·
   Internos · Transferencias · Ajustes`), Sububicación (`Todas · Piso · Almacén · Cuarentena`, solo
   si la sede las tiene: el Taller no) y Período (`7 días · 30 días · 90 días · Personalizado`); el
   proceso específico (Recepción, Venta, Transferencia · salida/llegada, Devolución, Cambio,
   Conteo…) va dentro de «Más filtros», con el mismo nombre que la columna «Movimiento».
   La sububicación viaja en la URL por nombre (`?sub=piso`), no por uuid: el enlace sigue valiendo si
   una líder cambia de sede. Un uuid viejo sigue entendiéndose.
   DESCARTÉ: pastillas para cada proceso (doce botones más) y un selector de sububicación con uuids.
   SE ROMPE SI aparece una cuarta sububicación que se filtre a diario: entonces va como pastilla,
   no dentro de «Más filtros».

4. **La persona sale de esta pantalla; la autoría sigue en la base.**
   DECIDÍ: no hay filtro «Persona» ni columna «Responsable» en `/inventario/movimientos`. `usuario_id`
   y `usuario_nombre` siguen guardándose y saliendo de `fn_movimientos`, `p_usuario_id` sigue en la
   firma, y el detalle de cada movimiento (el modal) sigue diciendo quién lo hizo. Un `?usuario=` de un
   enlace viejo se ignora sin romper nada. La pantalla es para leer qué cambió en el stock, no a
   quién culpar; la auditoría es otra pregunta con otro lugar.
   DESCARTÉ: quitar `p_usuario_id` de la firma (rompería a cualquier consumidor y es irreversible en
   producción sin otra migración) y dejar la persona como columna opcional (más ruido, no menos).
   SE ROMPE SI hace falta responder «¿qué movió esta persona esta semana?» a diario: eso es un
   reporte de auditoría, no un filtro de esta lista.

5. **La columna «Referencia» tiene su lugar desde `xl` (1280 px); con menos ancho baja a la segunda
   línea de «Movimiento».**
   DECIDÍ: seis columnas desde `xl`; con menos, cinco y la referencia debajo del proceso. El proceso
   y el origen → destino **se parten en dos líneas antes que cortarse con «…»**: «Transferencia ·
   lleg…» no dice si llegó o salió. Solo la prenda (nombre y código) acepta el recorte, y el nombre
   se parte hasta en dos líneas.
   DESCARTÉ: esconder la columna en pantallas medianas (una columna que desaparece sin avisar es
   peor que una que se apila) y una tabla de seis columnas a 1024 px (el proceso no cabía).
   SE ROMPE SI un proceso nuevo tiene un nombre de más de ~25 caracteres: se partirá en dos líneas.

6. **El período de N días TERMINA hoy** (hoy y los N−1 anteriores; misma cuenta que el Resumen).
   El recorte por defecto (30 días) no está en la URL: el botón «30 días» aparece apretado y las fechas
   de «Personalizado» muestran la que rige. **Cambio visible de un día:** antes «30 días» era «desde
   hace 30 días» (31 días con hoy).

7. **Traslados entiende el mismo identificador que Movimientos.** `coincideBusqueda` ya aceptaba
   «traslado 24», «#24» y «24»; ahora también «traslado#24», «traslado24», «n° 24» y «nro. 24»
   — las mismas formas que acepta `fn_movimientos_busqueda`, para que lo que se lee en la columna
   «Referencia» se escriba igual en las dos pantallas.
   SE ROMPE SI un código de prenda empieza por «num», «nro» o «traslado» seguido de dígitos pegados:
   se partiría en palabra + número (hoy ningún SKU de CAYLA es así).

## Consecuencias

- **Orden de despliegue: la migración ANTES que el front — ya cumplido** (aplicada en producción el
  2026-09-19; el front se fusiona después). El front está escrito para no romperse si saliera primero
  (los campos nuevos son opcionales), pero degradaría: sin la migración, «Traslado 24» se muestra como
  «Traslado» sin número y **escribir «Traslado 24» en el buscador se trata como el nombre de una
  prenda y no encuentra nada**. El orden que se siguió es el seguro: el front viejo, que sigue
  llamando a `fn_movimientos` con los mismos 12 parámetros y leyendo las columnas por nombre,
  funciona igual con la función nueva. Como `fn_movimientos` cambia su tipo de retorno, la
  migración hace `drop function` explícito de la firma anterior (dos sobrecargas harían ambigua la
  llamada por nombre de PostgREST); `fn_movimientos_resumen` conserva su firma.
- **Ensayo en producción (transacción revertida, datos reales: 464 movimientos, 4 sedes).** En las
  cuatro sedes, lista, búsqueda por prenda, filtro de tipo y tarjetas dieron **idéntico** a las
  funciones anteriores. «Traslado 1..4» devolvió exactamente lo esperado por un join directo (Traslado
  1: 2 filas en AQP y 2 en TRU; Traslados 2, 3 y 4: 3 cada uno, solo las salidas del Taller porque
  siguen en tránsito). Las seis boletas reales más recientes (B004-000007 a 000012) dieron lo esperado
  por serie-número, por «Boleta B004-…» y por «boleta N». Un colaborador de Tienda AQP ve su sede y
  sigue sin ver Tienda TRU (ni la lista ni el resumen). No hay datos reales de recepción con guía o
  factura de compra (0 movimientos con lote/compra): esa vía solo se probó con fixtures (prueba SQL) y
  sin error contra producción.
- **El nombre de proceso cambió y se comparte.** «Reposición» a secas pasó a «Ajuste · reposición»
  (se confundía con «Reposición interna», que es bajar del almacén al piso) y las transferencias
  dicen «Transferencia · llegada» / «· salida» según el signo en la sede que se mira. Lo lee también
  el Historial de producto (`HistorialProductoPanel`).
- **Traslados solo carga los en curso y los 30 cerrados más recientes**: escribir el número de un
  traslado cerrado hace meses en Traslados no lo encuentra (sí se llega a él desde Movimientos por el
  enlace de la columna «Referencia», que abre el detalle por id). Límite que ya existía; hoy no se nota
  (20 traslados en total en la base de pruebas).
- **Verificación.** `movimientos-reglas.test.ts` (45) y `traslados-reglas.test.ts` cubren las reglas
  puras; `scripts/pruebas/fn_movimientos_referencias.mjs` (72 verificaciones, todo dentro de una
  transacción que se revierte, también en CI) prueba la búsqueda, las tres vías de una boleta, la
  combinación con los demás filtros, que la lista y las tarjetas cuenten lo mismo, los permisos por
  sede y las firmas. Verificado a mano en el navegador con datos reales locales (Trujillo, Taller):
  filtros, búsqueda, clic en «Traslado 26» → su detalle, modal, 1440/1280/1024 px y móvil.
- **No cambia:** el ledger (`movimientos` sigue siendo append-only), las cinco categorías de ADR-0050,
  el detalle por URL (`?mov=`), el paginado por cursor, las tarjetas de arriba, la exclusión de la
  variante centinela «Cargo especial».
