# ADR-0435 · Metas por mes y por fecha: la meta sigue al calendario, no a una sola semana

- **Fecha:** 2026-10-17 · **Estado:** construido y verificado en local (suite de base nueva, suites vecinas, vitest de toda la web, tipos y Knip).
  **La migración `20261017020000` NO está en producción**: se pega en dos partes, con el OK de Felipe. Rama `claude/configuracion-meta-68a95e`.
- **Pedido:** Felipe, 2026-10-17: «hay que poner de una vez las metas… date cuenta que no todos los meses son iguales ni todos los días».
  Decidió con `AskUserQuestion`: tabla mes×día en la base, octubre cargado ya, **+6 % para las dos tiendas** («seamos exigentes»), índice
  estacional de varios años por el nivel reciente («usa matemáticas y estadísticas avanzadas») y horizonte octubre a diciembre de 2026.
- **Extiende:** ADR-0195 F1 (metas por día de la semana y campañas). **Complementa:** ADR-0253 (Configuración delegable), ADR-0423 (techo de la meta).

## El problema primero

La meta de una tienda era UNA semana (lunes a domingo) igual los 12 meses. Pero un día de la semana no vende lo mismo en octubre que en
diciembre, y el 23, 24 y 31 de diciembre venden ~2 veces su día. Con una sola semana, o diciembre queda con la meta de octubre o alguien
reescribe 14 casillas cada día 1 y, si se olvida, el mes entero queda mal.

## La estimación (con qué se calcularon los números)

- **Datos.** `ventas_historicas` (cierres diarios de los libros SINATRA: TRU 2017 a jul-2026, AQP 2024 a jul-2026) y la hoja de cierres
  de Felipe (hasta el 4-oct-2026, que tapa agosto y septiembre). **La fecha real de un cierre es la «Marca temporal»**, no la columna
  «Fecha»: desde el 18-ago-2026 la de AQP se corre días y la de TRU se corre un día en unas 30 filas. Las 18 filas de AQP sin fecha se
  recuperan por su marca. Para AQP hasta julio se usa la base (la hoja traía mayo sin el efectivo y julio duplicado).
- **Modelo.** `log(venta media por día abierto) = nivel del año + índice del mes + factor del día de la semana`, ajustado por mínimos
  cuadrados ponderados por días. El nivel de hoy se toma de los meses recientes **desestacionalizados**, con vida media del peso elegida por
  la validación (**1 mes en TRU, 3 en AQP**). Un efecto mes×día no apareció (se contrastó contra el factor global con contracción
  empírica de Bayes): lo que cambia entre meses es el nivel, no la forma de la semana.
- **Validación hacia atrás** (orígenes mensuales, horizontes de 1 a 3 meses, errores de totales mensuales): **TRU 10 a 11 %** contra **18 a 20 %** de
  copiar el mismo mes del año pasado o de promediar plano 12 meses. **AQP: ninguna estacionalidad propia mejora al promedio plano (~12 %)**, porque
  solo hay 2 años: se usa la de TRU a mitad de fuerza (conserva un efecto navideño moderado sin el ruido).
- **Empuje +6 %** sobre lo esperado, en las dos tiendas. Con el error de validación, un mes se cumple cerca de **1 de cada 3 veces**
  (no es una meta fácil, a propósito).
- **Fechas especiales** (razón real/esperado, mismos años): TRU 23-dic ×2,1, 24-dic ×2,1, 31-dic ×2,5; AQP 24-dic ×0,8 y 31-dic ×2,4. El
  25-dic no hay ventas en ningún año (sin meta). El 24-dic-2024 de TRU se descarta: vale exactamente lo mismo que el 23 (copia). Un 23-dic de AQP no se repite entre años: queda como día normal.
- **Lo que hay que saber al leerlas.** El ritmo de las ventas está por debajo del del año pasado desde junio de 2026, así que las metas con +6 %
  sobre el ritmo actual quedan por debajo de las del mismo mes de 2025. Felipe lo vio y eligió esa base.

## La decisión

1. **`ubicacion_metas_mes`** (tienda × mes × día de la semana) y **`ubicacion_metas_fecha`** (tienda × fecha, `meta` 0 = no abre). Lo vacío de un mes
   usa la semana tipo (`ubicacion_metas_dia`, que sigue como base y respaldo): un mes sin cargar funciona como hoy.
2. **`fn_parametros_caja` pasa a ser un ENVOLTORIO.** El cuerpo vigente (con la guardia `sin_acceso_retail` de `20261015222000`) se renombra
   `fn_parametros_caja_normal` SIN reescribirlo, y la función pública decide la base: **fecha (final, sin % de campaña) > semana del mes
   > semana tipo > `meta_venta_diaria`**. La campaña sigue subiendo la base del mes y de la semana tipo. Se eligió envolver y no reemplazar el
   cuerpo para no arriesgar el parche de seguridad ni depender de un md5. **Costo:** una migración posterior que haga `create or replace` de
   `fn_parametros_caja` la pisaría; la prueba lo vigila (`pnpm pruebas:metas-mes-y-fecha`) y, para cambiar la base, se parcha `fn_parametros_caja_normal`.
3. **Escritura y lectura:** `guardar_metas_mes`, `guardar_meta_fecha`, `fn_configuracion_metas`. Mismo permiso que `guardar_metas_tienda`
   (`fn_puede_configurar()`: el líder o quien tenga Configuración), firman con el responsable y cada cambio queda en `configuracion_historial`.
4. **Candados:** meta `NaN`, ≤ 0 (en una fecha, 0 vale) o de 10 millones o más; mes que no es día 1; día fuera de 0–6; Taller o almacén; un mes
   o una fecha ya pasados (no se reescribe la historia); más de 18 meses adelante; una nota de más de 140 letras. RLS encendido sin políticas.
5. **Pantalla:** dos tarjetas nuevas en Configuración ▸ Tiendas y caja («Meta mes por mes», con la semana tipo en gris como valor de fábrica, y
   «Fechas especiales»), con el patrón de la casilla que se guarda sola. La casilla se sacó a `ConfiguracionCasilla.tsx` para compartirla.

**Descartado.** Un solo % por mes sobre la semana tipo: aplana que el sábado de diciembre suba más que el martes. Reescribir 14 casillas a mano cada
mes: se olvida. Usar las campañas (`campana_efecto_caja`) para los meses fuertes: las campañas son etiquetas de descuento con fechas propias, y
un mes de meta no es una campaña. Copiar el mismo día del año pasado: 46 a 48 % de error por día en AQP contra ~32 % del modelo.

## Lo que no se hizo (y por qué)

- El **Panel comercial** (`lib/comercial.ts`) todavía lee `ubicaciones.meta_venta_diaria`, la columna que nada escribe. Es otra pantalla y otro PR.
- Cargar noviembre y diciembre en producción: espera a que la migración esté pegada.
- LIM no tiene datos históricos: queda sin meta hasta que los tenga.
- El recorredor de guías no pudo correr en local (a la base local le faltan migraciones viejas, p. ej. `fn_guias_vistas`); se comprobó a mano que las dos anclas
  nuevas existen y `lib/guias.test.ts` valida pasos, anclas y huella.

## Cómo se pega en producción

Dos partes, cada una en su propia ejecución del SQL Editor y en orden (ver la cabecera de la migración): **PARTE 1** las dos tablas; **PARTE 2** el envoltorio y las
tres funciones. Ninguna crea políticas. Antes (consultado el 2026-10-16): `fn_parametros_caja` ya trae la guardia de `20261015222000`, y las tablas nuevas no existen.
Después: `fn_parametros_caja_normal` existe, la API no puede llamarla, y la meta de hoy de cada tienda es la misma de antes.

## Cómo se verifica

- `pnpm pruebas:metas-mes-y-fecha` (47 casos): el envoltorio responde igual que su base, el orden fecha > mes > semana tipo, la campaña sobre el mes, `fn_meta_mes`,
  los candados de las funciones y de las tablas, quién puede, lo que lee la pantalla y que el envoltorio sigue vivo y cerrado.
- `pnpm pruebas:sesion-no-es-equipo` (repega `20261015222000`, que compara el md5 de `fn_parametros_caja`: ahora primero quita el envoltorio y al final lo vuelve a pegar), `configuracion-caja`,
  `metas-persona` y `roles`.
- `apps/web`: `lib/configuracion-reglas.test.ts` (validación y lectura), toda la suite de vitest, `tsc` y `knip`.
