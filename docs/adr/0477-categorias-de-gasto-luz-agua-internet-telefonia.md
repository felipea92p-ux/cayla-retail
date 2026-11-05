# ADR-0477 · Luz, Agua, Internet, Telefonía y Software son categorías de gasto propias

- **Fecha:** 2026-10-22 · **Estado:** construido y probado en local (`pnpm pruebas:gastos` y las suites de Finanzas, vitest de la web, y la pantalla real en una
  pila propia); **la migración NO está en producción**. Migración `20261022205000_categorias_gasto_luz_agua_internet_telefonia.sql` (reservada con `pnpm reservar`).
- **Decide:** Felipe, 2026-10-22, al ver el borrador de los servicios sacados de los libros de las tres sedes: «crea Luz, Agua, Internet y Telefonía como categorías»;
  y, ya construido, «Software y suscripciones: sí, ahora», «boleta, como Claro» y «analiza cuál es lo óptimo» para los botones de Caja.
- **Toca:** ADR-0452 (la ficha del gasto fijo: sus textos por categoría).

## El problema primero

«Servicios básicos» (cuenta 636) juntaba cuatro cosas distintas. Para saber cuánto se va en luz había que leer la descripción de cada gasto, escrita a mano, y la
ficha del fijo pedía lo mismo a una luz (un N.º de suministro) que a un celular (el número de la línea). Los libros de gestión de las tres sedes, de donde sale la
carga inicial de los gastos fijos de servicios, ya los distinguían a mano. Y el software (Adobe, Google Workspace, ChatGPT, el dominio, Shopify) no tenía dónde caer.

## Decisión

DECIDÍ: cinco categorías nuevas en `retail.categorias_gasto` — `luz`, `agua`, `internet` (con o sin teléfono fijo), `telefonia` (celular o plan móvil), las cuatro en la cuenta
**636**, y `software` («Software y suscripciones») en la **639**, provisional hasta que el contador la confirme — y la lista ordenada así: Alquileres, Luz, Agua, Internet,
Telefonía, Software y suscripciones, Servicios básicos y el resto como estaba.

- **Para el contador nada cambia en los servicios.** El Estado de resultados y el Presupuesto agrupan por **cuenta**, no por categoría: las cuatro suman en la misma línea 636
  «Servicios básicos» (probado: cinco gastos, uno en cada categoría, suben esa línea exactamente lo mismo). Lo único visible es el nombre de esa línea en el Presupuesto, que
  concatena las categorías de la cuenta («Luz · Agua · Internet · Telefonía · Servicios básicos»), como ya hace 631 con dos.
- **La cuenta 639 deja de llamarse «Otros servicios de terceros (bancarios)»** y pasa a «Otros servicios de terceros» (solo el nombre; el código y lo que suma no cambian): la usaban solo las
  comisiones del banco y del POS, y con el software al lado el paréntesis en el Estado de resultados mentiría.
- **Lo que sí cambia** es lo que ve quien registra: la lista de Gastos y sus totales por categoría separan Luz de Agua, y la ficha del gasto fijo habla del servicio
  (`lib/sugerencias-gasto-fijo.ts`): luz y agua piden «N.º de suministro» y **no piden fecha de vencimiento** (el servicio no vence); internet pide «N.º de cliente o de
  contrato» y telefonía «Número de la línea», las dos con la fecha solo si el plan tiene permanencia; software pide el ID de la cuenta (nunca la clave) y «Se renueva el».
  Ningún texto pide el número de cuenta bancaria (es solo de líder y admin, ADR-0452).
- **«Servicios básicos» conserva su código y su nombre**; solo cambian sus ejemplos («Baño, gas, vigilancia u otro servicio del local») y los textos de su ficha, para que
  ya no prometan luz ni teléfono. Lo ya registrado (los gastos de baño y los fijos cargados) sigue apuntando a la misma categoría.
- **Caja no se toca.** Sus botones «Agua», «Luz» e «Internet y celular» siguen guardando en `servicios_basicos`. Medido en producción el 2026-10-22 (79 gastos vigentes en esa
  categoría): 66 son «Baño» (S/ 0.30 a S/ 1.80), 10 son «Agua» y se leen como botellas y bidones («Botella de agua», «Comprar agua», S/ 3 a S/ 12, una de S/ 50) y ninguno es
  luz ni internet. O sea, el «Agua» de Caja es la botella del turno, no el recibo del agua: moverlo a `agua` mezclaría botellas con el recibo de Sedalib. El recibo entra por
  los gastos fijos y por Finanzas ▸ Gastos, que sí usan las categorías nuevas. Dos caminos, dos cosas distintas, cada una en su lugar.
- Migración de una sola parte, sin `alter` ni políticas: sentencias sobre dos catálogos (`categorias_gasto` y el nombre de una fila de `cuentas`), idempotente (el `orden` se fija con una lista literal
  para que pegarla de nuevo no corra los números). Su última sentencia responde `QUEDÓ BIEN`, `REVISAR: …` (con qué revisar) o `AVISO` si una categoría ajena repite un orden.

## Lo que se descartó

DESCARTÉ: **una columna «tipo de servicio»** en `gastos_fijos` y `gastos`. Cuesta una migración con `alter` de tablas que leen Flujo, Resumen, Cierre y Presupuesto, y las categorías ya
cumplen ese papel (la lista, los totales y la ficha salen de ellas sin tocar nada más).

DESCARTÉ: **renombrar `servicios_basicos` a «Otros servicios básicos»**. Se hizo y se revirtió después de medirlo: ponía en rojo `scripts/pruebas/resumen_finanzas.mjs` (exige el nombre
«Servicios básicos» en un caso) y hacía que, al tocar «Luz» en Caja, la hoja dijera «Va a Otros servicios básicos» con una categoría «Luz» existiendo al lado. El costo de dejarlo
(«Servicios básicos» junto a «Luz» y «Agua» se lee un poco redundante) lo cubren los ejemplos de su fila en el combo.

DESCARTÉ: **mover los botones de Caja a las categorías nuevas**, y también que el gasto rápido «reconozca» lo pagado en `luz` o `agua` como suyo (se construyó y se quitó): el «Agua» de Caja
son botellas de S/ 3 a S/ 12; contarle el recibo del agua le ensuciaría la ★ y los montos habituales de un botón que se usa para otra cosa. «Internet y celular» es además un botón para dos categorías.

DESCARTÉ: **reclasificar los gastos ya registrados.** Hoy son pocos y no hay forma de saber cuáles eran luz o agua sin leerlos uno a uno.

DESCARTÉ: **cargar el software como gastos fijos.** Un fijo es un cobro mensual; en los libros cada software aparece una sola vez (ChatGPT, el dominio, Shopify), sin saber si es mensual o anual, y cargar
S/ 799 «todos los meses» alimentaría Flujo y Presupuesto con un número falso. La categoría existe para registrar el pago cuando ocurre; el que resulte mensual se agrega como fijo después.

## SE ROMPE SI

- **El contador pide una cuenta contable distinta por servicio** (por ejemplo, la luz en otra subcuenta de 636): entonces las categorías ya no bastan y hay que cambiar `cuenta_pcge` de la categoría (una fila) y
  revisar Presupuesto y Estado de resultados, que agrupan por cuenta. Lo mismo si el contador manda el software a otra cuenta que la 639.
- **En Caja se empieza a pagar el recibo de la luz o del internet desde el cajón** y no se usa un fijo: ese gasto quedaría en «Servicios básicos» y no en «Luz», y el total por categoría de Gastos quedaría corto.
  Hoy no pasa (0 de 79), y si pasa el arreglo es mover el botón «Luz» (1 a 1), no el de «Agua».
- **Un líder crea por SQL otra categoría con un `orden` ya usado**: la lista no se rompe (el orden desempata solo por ese número) pero dos categorías quedan «empatadas»; la migración lo avisa en su última sentencia.

## Lo que quedó fuera (pendientes)

- **Las tres categorías de octubre** (`atencion_personal`, `traer_mercaderia`, `viaje_compra`) no tienen texto propio en la ficha del fijo y caen a la neutra («Propietario o empresa», «Vence el contrato»); la prueba de
  totalidad cubre las categorías de la siembra y las de esta migración, no esas tres.
- **Fijos sugeridos viejos:** `fn_gastos_fijos_sugeridos` agrupa por categoría y proveedor, así que los pagos hechos a mano antes (en `servicios_basicos`) siguen proponiendo un fijo que ya existe en `luz`; se descartan con «no es fijo».
- **Luz y agua sin fecha de vencimiento** dejan un hueco a la derecha de «N.º de suministro» en la hoja (una fila de dos columnas con una sola); no rompe nada, y ocupar el ancho completo es un ajuste menor.

## Cómo se pega en producción

1. La migración, sola y tal cual (trae `retail.` y su `set search_path`); el último renglón debe decir `QUEDÓ BIEN`. Antes se puede mirar con un `select codigo, orden from retail.categorias_gasto order by orden` que hay 13 categorías y ninguna repite orden
   (el 2026-10-22 eran 13, órdenes 1 a 13).
2. Después, `pnpm datos:generar:produccion` (regla de oro de `docs/datos`).
3. La carga de los gastos fijos de servicios (tres archivos SQL que traen números de suministro y de teléfono) **no vive en el repo**, que es público: se entregan aparte a Felipe, con su LEEME. Llaman a `retail.guardar_gasto_fijo`
   (la función real del botón «Nuevo gasto fijo»), son idempotentes y de todo o nada. Los fijos nacen con comprobante «boleta» (decisión de Felipe: como su fijo de Claro) y forma de pago «se paga el recibo».

## Probado

- Migración aplicada en una base limpia como se pega en el SQL Editor (`psql -1`), dos veces: misma huella md5 de la tabla; 18 categorías, órdenes 1 a 18 sin repetir, las 4 de servicios en 636 y activas, el software en 639; `fn_categorias_gasto()` las devuelve en orden.
  Con una categoría extra de orden repetido la última sentencia dice `AVISO …`; con un `luz` previo en otra cuenta, `REVISAR …`.
- `scripts/pruebas/gastos.mjs`: casos nuevos (catálogo y orden, la cuenta 639, un fijo con ficha en cada categoría, rechazo de un código inventado, y que un gasto en cada una de servicios suma en la **misma** línea 636 del Estado de resultados, del panel de Gastos y del Presupuesto);
  **prueba de mutación**: sin la migración fallan 19; con `luz` en la cuenta 635, 5; sin `telefonia`, 16; con el software en 636, 2; con «Servicios básicos» renombrado, 2; con la cuenta 639 otra vez «(bancarios)», 1. Las suites de Finanzas (presupuesto 78, flujo 79, cierre 124, estado de resultados 74, balance 69,
  resumen 68, gasto fijo y ficha 51, activos y fijos 66, cuentas y dinero 88 y otras) pasan.
- Web: `lib/sugerencias-gasto-fijo.test.ts` (cada categoría nueva con ficha propia, sin mezclar un servicio con otro, sin pedir la cuenta bancaria ni una clave, y que la prueba lee los códigos de la migración), suite completa de la web, `tsc`, `eslint`, `knip`.
- Pantalla real, en una pila propia con la migración: el combo de categorías en el orden dicho; la ficha cambia sus títulos, ayudas, ejemplos y fecha de vencimiento al elegir cada una y no deja restos al volver a Alquileres; sin desborde a 375 px; legible en modo oscuro; un fijo en Luz y otro en
  Telefonía se guardaron con su ficha y salieron en la lista; cuatro gastos de prueba salieron en Gastos con su categoría y cuenta 636. Sin errores de consola. (Esa corrida fue antes de agregar «Software y suscripciones»; la ficha del software está probada solo por vitest.)
- **Sin probar:** que un usuario que no es líder vea bien la ficha de estas categorías; «Registrar» un fijo de estas categorías desde «Fijos del mes»; la ayuda «Sale en el recibo, con el nombre “Suministro”» contra un recibo real de cada empresa.
