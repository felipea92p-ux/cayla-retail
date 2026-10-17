# 16 · Cómo aplicar la ronda a lo ya construido y pegado en producción

**Fecha:** 2026-10-16 · **Estado:** plan, **nada construido ni pegado.** Complementa la «Actualización 2026-10-16 (k)» de ADR-0400 con el mapa por objeto: qué tabla, restricción,
función o archivo de la web toca cada cambio, en qué orden, y qué necesita el OK de Felipe. Los nombres salen de `main` (PR #1140 ya fusionado) y de la base de producción en solo
lectura; lo que no se verificó dice «por verificar».

## Los tres hechos que mandan el orden

1. **La web del rediseño ya está desplegada** y habla con **seis claves de fase** (`corte`, `costura`, `acabado`, `bordado`, `estampado`, `lavanderia`; `apps/web/lib/orden-fases-reglas.ts`).
2. **Producción tiene 0 filas** en `producciones`, `produccion_fases`, `produccion_avances`, `produccion_salidas`, `produccion_vueltas`, `produccion_insumos`, `producto_consumos`,
   `proveedor_tarifas`, `insumos` y `proveedores_produccion` (`SELECT`, 2026-10-16, después de la fusión). Cambiar el esquema **no migra datos**; la ventana barata se cierra con
   la primera orden real.
3. **Un cambio de esquema en producción lo confirma Felipe**, y lo que toca stock o dinero (`cerrar_produccion`, `anular_produccion`) lleva su OK aparte.

**Regla de secuencia: expandir → web → contraer.** La base acepta claves viejas y nuevas; la web pasa a las nuevas; recién después se quita lo viejo (o se deja sin uso: con 0 filas no
estorba). Contraer primero deja a la hoja «Nueva orden» desplegada mandando claves que la base rechaza.

## Mapa por actividad

| # | Qué | Base (objeto real) | Web | Toca stock o dinero |
|---|---|---|---|---|
| **R1** | Fases nuevas: `ploteo`, `ojales_botones`, `limpieza_revision`, `planchado`, `etiquetado_embolsado` (claves sugeridas); `acabado` queda sin uso; bordado, estampado y lavandería siguen en la base y se apagan en pantalla | CHECK `produccion_fases_clave_check` y `proveedor_tarifas_fase_clave_check`; `fn_fase_secuencia` (la usa el CHECK `produccion_fases_secuencia_de_la_ruta`; sugerencia de números: ploteo 5, corte 10, costura 30, ojales y botones 35, revisar 60, planchar 65, etiquetar 70, y los de bordado, estampado y lavandería como hoy); `fn_fase_nombre`; `fn_produccion_fases_normalizar` (hoy exige «por lo menos Corte, Costura y Acabado», `fases_espina`: pasa a los seis fijos); `fn_fases_de_orden` (partir de su última versión, `20261015160000`); `abrir_orden_produccion` | `orden-fases-reglas.ts` (`FaseClave`, `FASES`, `secuenciaDe`; su prueba lee la migración y exige cada `hint`), `ordenes-lista-reglas.ts`, `tarifas-servicios-reglas.ts`, `orden-pagina-reglas.ts`, `NuevaOrdenProduccionForm`, `FasesDeLaOrden`, `CambiarQuienModal`, `TarifaServicioModal`, `OrdenesLista`; la guía y su huella, los escenarios de tema | No |
| **R2** | Tope de cortar de más: 3 por talla y color | `fn_produccion_entrada_variante` (hoy `ceil(plan × 1,10)` en la primera fase). El techo de cierre de ADR-0415 (`greatest(plan × 2, plan + 5)`, `buenas_de_mas`) **no se toca**: queda como segunda red | La constante y los textos que digan «10 %» (por verificar dónde) | No directo (limita el avance, no escribe stock) |
| **R3** | Fase corta cerrada por la encargada, con motivo; «se arregla y cuenta» | Función nueva para registrar la pérdida con motivo en una fase del Taller. Hoy `fn_fases_de_orden` da «hecha» solo si hechas + segundas + faltantes ≥ entrada, y en el Taller no hay segundas ni faltantes: una fase corta nunca queda hecha | Botón y hoja del paso; el aviso de «Pasar al stock» | No (el stock sigue naciendo solo en `cerrar_produccion`) |
| **R4** | Tela por kilo y «lo medido manda desde 3 órdenes» | `insumos.unidad_medida` **ya admite `kilo`** (CHECK), pero no hay conversión: columnas nuevas de ancho y gramaje (en `insumos` o por tejido, a decidir al construir); `produccion_insumos`, `fn_tela_del_taller`, `fn_tela_pendiente_de_la_orden` y `fn_tela_en_camino` suman cantidades **sin separar unidades**: con kilos y metros mezclados la cuenta de «¿alcanza?» saldría mal (principio 2). `cerrar_produccion` guarda el consumo medido en `producto_consumos` en **cada** cierre (metros usados ÷ buenas) y gana sobre lo declarado: pasa a ganar desde el tercero, y el medido de un punto en kilos no puede mezclarse con el declarado en metros | `orden-tela-reglas.ts`, Nueva orden (consumo del modelo), Insumos (ficha de la tela), Resumen | **Sí: `cerrar_produccion` y el costo. OK aparte de Felipe.** Antes: un reporte real de Audaces y una factura de punto para fijar la fórmula |
| **R5** | Datos al abrir: reposición o novedad, tienda destino, urgente con fecha, quién aprobó la muestra | Columnas nuevas en `producciones` y el payload de `abrir_orden_produccion` (el destino hoy lo decide Traslados: cómo conviven, por decidir) | Nueva orden, lista y página de la orden | No |
| **R6** | Anular con tela ya cortada pregunta qué se hace | `anular_produccion` (hoy devuelve el consumo neto de cada lote a su costo y solo frena si hay prendas afuera) | Hoja de anular | **Sí: stock y costo. OK aparte de Felipe** |
| **R7** | Cambiar una orden abierta con motivo | Función nueva con reglas según lo avanzado (hoy no existe ninguna que edite una orden abierta) | Página de la orden | No directo |
| **R8** | Costo del Taller por mes aparte; cifras del cierre; señal de atraso del servicio | Solo lecturas: Eficiencia ya existe, pero `planilla_por_sede` oculta cualquier sede con menos de 3 personas y el Taller tiene hoy exactamente 3 | Cierre de orden, lista, Eficiencia | No |
| **R9** | Papeles del servicio: factura, boleta, recibo, nada; «sin factura» marcado | `comprobantes_produccion.tipo` hoy solo admite `factura`, `boleta` y `nota_venta` (por verificar si «sin factura» es un tipo o una marca) | Registrar comprobante | No (el comprobante es solo del líder) |
| **R10** | Dirección del Taller | Un `UPDATE` de `ubicaciones` (dato; **no se versiona**, repo público) | — | No; lo confirma Felipe |

## Orden recomendado

1. **Un solo pegado de esquema «expandir», antes de la primera orden real**: las claves nuevas de R1, las columnas de R5, la función de R3 y las columnas de R4 (solo columnas, sin tocar
   `cerrar_produccion`). Sin políticas, en partes cortas con `set lock_timeout`, idempotente, escrito con el prefijo `retail.` y reemplazos anclados con candado de md5 para las
   funciones ya parchadas. Antes: `pnpm reservar migracion` por cada archivo.
2. **El PR de la web** que usa lo nuevo (R1, R2, R3, R5, R7, R8, R9 en el orden que Felipe pida), con la guía, la huella, los escenarios de tema y `/chaos` en lo que guarda.
3. **R4 y R6 (las que tocan stock y dinero)** cada una con su prueba que falla primero y el OK explícito de Felipe antes de pegar.
4. **Contraer** (quitar `acabado` y lo viejo) solo si Felipe lo pide; con 0 filas dejarlo sin uso es gratis y deja el retroceso abierto.

## Cómo se verifica

- Las suites de base de Producción (`produccion_fases`, `-avances`, `-anulaciones`, `-lista`, `-cierre`, `-tela`, `-tarifas`, `-tela-del-taller` y `candado_dinero_produccion`; se corren con
  `node scripts/pruebas/<nombre>.mjs`). **Trampa conocida:** reaplicar una migración vieja ENTERA a la base local pisa lo que parcharon las posteriores; hay que reaplicarlas todas en el
  orden de las suites (`154000`, `155000`, `20261014160000`, `20261015160000`, `20261015005000`, `165000`, `172000`, `173000`) y volver a correr las ocho.
- En el navegador: abrir una orden con los siete pasos, mandar uno a un servicio, terminar uno corto con motivo, y a 375 px lo que toque el mostrador.
- En producción, solo lectura después de pegar: mismas funciones con el md5 de la copia de ensayo y las tablas con la estructura esperada.

## Qué queda por preguntarle a Felipe antes de construir

1. Si el orden de los supuestos le sirve (**«revisar» antes de «planchar»**, **ojales y botones solo si el modelo los lleva**, **ploteo con un toque «hecho»**).
2. Qué quiere que haga la base con Patronaje y Muestreo en el modelo (solo quién y cuándo, o también una tarifa si salen a un servicio).
3. Cuándo se abre la primera orden real: la ventana barata para cambiar el esquema se cierra ese día.
