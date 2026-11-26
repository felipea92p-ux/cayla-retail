# Empresas aliadas y una boleta por RUC (investigación, 2026-11-21)

**Estado:** análisis y maqueta (`docs/maquetas/empresas-aliadas-2026-11/`). Nada construido, nada en la base. La emisión por RUC
cambia cómo se declara a SUNAT: **espera el visto del contador y el OK de Felipe** antes de construir.

## El pedido, interpretado

«Cada uno de estos empresarios tiene su RUS y quiere elegir con qué razón social cobrar» quiere decir: **cada dueña quiere que lo que
vende salga con su propio RUC, no con el de CAYLA.** «Elegir» se hace **una vez, al decir de quién es cada prenda**; no en caja, venta
por venta. Al cobrar, el sistema ve de quién es cada prenda y arma una boleta por dueña, sola (Felipe, 2026-11-21).

Las empresas (respuestas de Felipe, 2026-11-21):

| Empresa | Quién emite | Régimen | Dónde vende |
|---|---|---|---|
| CAYLA | CAYLA S.A.C. (RUC 20) | no es RUS: da factura y boleta | AQP, LIM, TRU |
| Claurè | su dueña (RUC 10) | Nuevo RUS | LIM |
| CAYLA KIDS | su dueña (RUC 10) | Nuevo RUS | TRU |

El RUS personal del dueño de CAYLA **no vende nada por ahora** (Felipe): todo lo de CAYLA sale con el RUC de la S.A.C.
Nombre en pantalla: **«Empresas aliadas»** (Felipe). «Ramas» se descartó: dice que son parte de CAYLA, que es lo contrario.

## Lo que ya existe (no se empieza de cero)

- `retail.empresas` + `retail.empresa_sedes` + `productos.empresa_id` (ADR-0463): cada prenda ya dice de quién es, y Nuevo producto ya
  pregunta la empresa **solo en una sede con dos empresas**. Con CAYLA KIDS sumada a Trujillo en `empresa_sedes`, Trujillo la pregunta
  sola, sin tocar Nuevo producto.
- El stock de Lima por dueño (ADR-0542), Claurè solo en Lima (ADR-0505), lo vendido por empresa (ADR-0532, ADR-0665, ADR-0667).
- **Toda boleta sale con el RUC de CAYLA:** `configuracion_empresa` es UNA fila (`id boolean primary key`), las series son por sede y
  hay un solo `LUCODE_TOKEN`. Por eso Claurè hoy es **consignación**: la cuenta con Claudia (ADR-0558, ADR-0560, ADR-0638: la 479, el
  IGV que asume CAYLA, el Yape de Claudia).
- Lo que falta para el pedido: **crear una empresa desde Configuración** (hoy Claurè nació en una migración) y **emitir con otro RUC**.

## La pregunta de la boleta mixta

**Una boleta tiene un solo emisor (un RUC).** No existe «una boleta con dos RUC».

- **Hoy, en Lima:** una boleta de CAYLA. Para SUNAT **toda** la venta es de CAYLA: CAYLA declara el IGV (18 %) y la renta también de
  lo de Claurè. La ganancia de Claurè existe solo puertas adentro (el sistema la separa por prenda y lleva la cuenta con Claudia).
  Ejemplo: un cárdigan de Claurè de S/ 99 hoy le cuesta a CAYLA S/ 15,10 de IGV.
- **Con una boleta por RUC:** la misma compra sale en dos boletas (CAYLA y Claurè), un solo cobro repartido. Cada RUC declara solo lo
  suyo. Lo de Claurè paga la cuota fija del Nuevo RUS (S/ 20 o S/ 50 al mes, según categoría), no 18 % por prenda.

Si Claurè vende S/ 3,000 al mes, hoy CAYLA paga por eso unos S/ 458 de IGV; con su propia boleta, Claurè paga su cuota.

## A quién beneficia y a quién perjudica

**Gana:**
- CAYLA deja de pagar IGV y renta de lo que no es suyo, y sus cifras dejan de mezclarse.
- Cada aliada tiene sus boletas y su IGV (en el RUS, su cuota) a su nombre: ve y declara lo suyo.
- Desaparece la mayor parte de la cuenta de consignación con Claudia (lo que CAYLA cobra por ella deja de ser un ingreso de CAYLA).

**Paga (las reglas del Nuevo RUS; confirmar con el contador):**
- **Tope:** S/ 8,000 al mes y S/ 96,000 al año. Pasarlo saca a la aliada del régimen. → el sistema avisa al 80 % y al 100 %, **sin
  bloquear** (Felipe).
- **Solo boletas, nunca factura.** Si un cliente con RUC pide factura, lo de CAYLA sale en factura y lo de la aliada en su boleta, y la
  pantalla lo dice antes de cobrar (Felipe: «especificar que ciertas prendas no pueden ser facturadas»).
- **Un solo local:** el Nuevo RUS opera en un establecimiento, que debe figurar en su RUC (la dirección de la tienda donde vende).
  Claurè solo en LIM y CAYLA KIDS solo en TRU calzan; una aliada RUS en dos tiendas, no. La hoja lo avisa.
- **El riesgo de fondo (el que más pesa):** tres negocios de una misma familia, en el mismo local, con las mismas colaboradoras y la
  misma caja. SUNAT puede verlo como **un solo negocio partido en RUS** para pagar menos, y cobrar todo como de CAYLA. Lo que lo separa de
  verdad: mercadería comprada a nombre de cada una, cobros a cuentas de cada una (ya pasa con el Yape de Claudia, ADR-0638), y **un
  contrato por escrito entre CAYLA y cada aliada** (local, atención, caja) con lo que CAYLA les cobra por eso, facturado por CAYLA.
- **Costo de operar:** cada RUC necesita su conexión a SUNAT por Lucode (afiliación al SEE, posiblemente un costo por RUC) y sus series.

## Propuesta de modelo (para decidir; no construido)

Contrato: *una prenda tiene una sola dueña; cada comprobante tiene un solo emisor y solo lleva prendas de esa dueña; un Nuevo RUS
nunca emite factura.*

1. **`retail.empresas` suma la identidad fiscal:** `ruc` (único, 11 dígitos), `razon_social`, `regimen` (`nuevo_rus | rer | mype |
   general`), `es_casa` (una sola, índice único parcial). La fila de `configuracion_empresa` pasa a ser la de la casa.
2. **Series por empresa:** `series_comprobantes.empresa_id`; la serie es única por empresa, no global (B001 de Claurè y B001 de CAYLA no
   chocan ante SUNAT, pero en la tienda se proponen distintas).
3. **Una venta → uno o más comprobantes** (`comprobantes.empresa_id not null`), en **la misma transacción** que la venta: la venta, sus N
   comprobantes y sus N correlativos quedan todos o ninguno. Estados imposibles hechos candado: factura de un Nuevo RUS; un comprobante
   con prendas de dos dueñas; la serie de una empresa usada por otra.
4. **Lucode por empresa:** la credencial vive en el servidor (nunca en una tabla que se lea), **nunca la clave SOL**. Si Lucode no
   responde o la aliada no está conectada, la venta se guarda y su boleta queda en la cola de reintento (ADR-0153): se degrada, no se pierde.
5. **El tope del RUS se calcula, no se guarda:** suma de sus comprobantes del mes; aviso al 80 %.
6. **Lo de «Claurè» se vuelve «empresa aliada»:** hoy hay funciones con el nombre escrito (`fn_item_es_de_claure`, la 479, el cierre con
   Claudia). Con tres empresas, una sola regla por dueña; si no, cada aliada nueva pediría código.
7. **Fecha de corte por empresa:** desde el día X, Claurè emite con su RUC. Lo anterior queda como consignación (no se reescribe).

DECIDÍ (propuesta): la dueña de la boleta sale de la prenda, nunca de una elección en caja.
DESCARTÉ: que la cajera elija el RUC al cobrar, porque una prenda de CAYLA saldría con un RUS y eso es justo lo que SUNAT lee como ingresos
escondidos; y la colaboradora tendría que saberlo en cada venta.
SE ROMPE SI: una prenda se registra con la dueña equivocada (sale la boleta con el RUC equivocado). Por eso la empresa se elige en
Nuevo producto sin valor marcado (ADR-0463) y cambiarla después debe pedir al líder.

## En fases

1. **Empresas aliadas desde Configuración** (maqueta): nombre, RUC consultado al padrón (ADR-0008), régimen y tiendas. Además (Felipe, 2026-11-21): correo y teléfono opcionales, y **cuentas para cobrar** (Yape, Plin o cuenta bancaria, tantas como tenga; «Agregar otra cuenta»). Lo que entra a esas cuentas es de la aliada y no suma a CAYLA (como el Yape de Claudia, ADR-0638). CAYLA KIDS NO se crea: es un ejemplo a futuro; lo que se construye es que cualquier aliada que se cree después venda sin problemas y tenga sus filtros. CAYLA KIDS ya
   aparece en Nuevo producto de Trujillo, en etiquetas, filtros y reportes. Las boletas siguen saliendo con CAYLA. Solo el Admin crea o
   edita una empresa (el RUC y el régimen tocan SUNAT). Ojo: la cuenta de consignación hoy solo sabe de Claurè.
2. **Una boleta por RUC** (el punto 3 de arriba), con el visto del contador, Lucode por RUC y la fecha de corte de cada aliada.

## Abierto

- ~~Botón: A, B o C~~ **Elegido por Felipe (2026-11-21): D.** CAYLA se queda como hoy, en su banda de solo lectura arriba (es la casa); debajo, «Empresas aliadas» con sus tarjetas y el botón «Agregar empresa aliada» **solo ahí, a un lado del título**. Ninguna tienda lleva botón. Las tarjetas de las tiendas no muestran quién vende ahí (Felipe: «Nada»). Como ninguna tienda abre la hoja, «¿En qué tiendas vende?» nace sin nada marcado y no deja guardar sin elegir al menos una.
- Contador: contrato y cobro de CAYLA a las aliadas; categoría RUS de cada una; si el local de cada aliada figura en su RUC.
- Lucode: ¿una cuenta con varios RUC o una por RUC, y cuánto cuesta?
- Seguridad: las claves SOL de las cuatro cuentas circularon en una captura y en una hoja de cálculo. Cambiarlas. El sistema no las guarda.
