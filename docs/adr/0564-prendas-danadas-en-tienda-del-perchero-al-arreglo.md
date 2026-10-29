# ADR-0564 — Prendas dañadas en tienda: separarlas con un botón, saber dónde están y volver al piso arregladas

- **Fecha:** 2026-10-28 · **Estado:** construido y probado en local (6 migraciones, ninguna pegada en producción todavía). Rama
  `claude/damaged-items-store-process-88b6c0`; el número y las versiones de migración están reservados (`pnpm reservar`).
- **Relacionados:** ADR-0071 (cuarentena de dañadas), ADR-0328 act. 10 (`reportar_danada` y «Se arregló»), ADR-0534 (quien ve Existencias
  resuelve las dañadas), ADR-0195 (políticas aparte), ADR-0306 (un módulo es una entrada del menú), ADR-0160/0162 (cuentas terminal),
  ADR-0208 (Frescura del piso), ADR-0284 (guía de foco), ADR-0290 (sugerencias coherentes), ADR-0358 (una función, una pieza).
- **Origen:** Felipe, 2026-10-28: las chicas ven prendas dañadas en el piso de la tienda y las separan ahí mismo, sin saber cómo hacerlo en el
  sistema. No las llevan al almacén con la tienda abierta (queda a 4 cuadras y hace falta gente atendiendo). La prenda no está en stock vendible
  y la dejan en una parte de la tienda para llevarla a arreglar después. Contestó 10 preguntas; sus respuestas son las decisiones de abajo.

## El problema

El sistema ya tenía el 70 % del camino (ADR-0328 act. 10): «Reportar dañada» en Existencias mueve la prenda a la cuarentena de la sede, y el líder
decide en «Dañadas» (se arregló, liquidada, se botó, donada, devuelta al proveedor). Lo que faltaba era lo que pasa **con la tienda abierta y sin
teléfono**:

1. nadie la encontraba: el reporte vivía dentro de la ficha de la talla, y las cuentas de caja y de almacén no usan el teléfono en horario;
2. escribir qué tiene la prenda frenaba el reporte, y cada quien lo escribía distinto;
3. «cuarentena» es un lugar lógico: no decía dónde dejar la prenda en la tienda;
4. de «en cuarentena» se pasaba directo a «se arregló»: el tiempo que la prenda está FUERA (con una costurera o en el Taller) no existía;
5. «Se arregló» devolvía siempre al almacén (otro paso para venderla), no había «volvió sin arreglo» y el costo del arreglo no se anotaba.

## Lo que se decidió (las 10 respuestas de Felipe)

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Quién reporta | Cualquier colaboradora (quien ve Existencias en su sede; sin permiso nuevo ni módulo nuevo, ADR-0306). |
| 2 | Foto del daño | Opcional: nunca frena el reporte. |
| 3 | Dónde se dejan | Las tiendas no tienen lugar fijo → cada sede marca el suyo y el sistema lo repite en pantalla. |
| 4 | Cómo salen | «Las lleva quien pase por el almacén»: sin envío formal; dos toques sueltos (salió / volvió). |
| 5 | Quién arregla | Depende del daño → el que saca la prenda elige «Cerca de la tienda» o «Taller de CAYLA». |
| 6 | A dónde vuelve | Al piso o al almacén, lo elige quien decide al marcar «Se arregló». |
| 7 | Qué tiene | Lista corta (mancha, descosido, botón o cierre, rotura, otro) + nota opcional. |
| 8 | Aviso | A los 7 días sin decidirse, en las tareas de la sede. |
| 9 | Costo | Opcional (a veces no se cobra); solo se anota. |
| 10 | Entrada | Un botón «Separé una dañada» a la vista en las cuentas de caja y de almacén, que no usan el teléfono. |

## Lo que se construyó (8 actividades, 7 commits de código)

1. **Tipo de daño** (`20261029024000`): `prendas_danadas.tipo_dano` y `reportar_danada(…, p_tipo default null)`. UNA sola firma (se borra la de 6
   parámetros): una web vieja que no manda tipo cuenta como «otro» y exige la nota, como antes. Con un tipo de la lista la nota es opcional; lo
   que queda escrito es la nota o, si no hay, el nombre del tipo. El placeholder del detalle sigue al tipo elegido (`lib/sugerencias-danadas.ts`).
2. **Lugar de las dañadas** (`20261029031000`): `sububicaciones.lugar` (3 a 80 letras) en la cuarentena de cada sede, `definir_lugar_danadas`. Se
   marca y se cambia en la ventana «Prendas dañadas»; «Reportar dañada» lo repite («Déjala en: …»).
3. **Botón «Separé una dañada»**: a la vista junto a Apartados en Vender, y como segundo botón de la cabina (y del dock del celular) en el Inicio de
   almacén. Lleva a `/inventario?danada=1`, que abre «¿Qué prenda está dañada?» y de ahí el mismo «Reportar dañada» (un solo camino, una sola
   regla). Solo se ofrece si el rol ve Existencias. Sin migración.
4. **«Salió a arreglar»** (`20261029032000`): `en_arreglo_desde`, `ruta_arreglo` (cerca | taller), quién la sacó y nota; `sacar_danada_a_arreglar`.
   **No mueve stock**: la prenda sigue en la cuarentena de la sede (no se vende, el conteo la ve donde estaba); lo que cambia es dónde está de verdad,
   y eso lo dice la fila («En arreglo · Taller · hace 3 días»).
5. **Regreso** (`20261029033000`): `arreglar_prenda_danada(…, p_destino, p_costo)` y `no_se_pudo_arreglar`. Con destino «piso» hace DOS traslados
   internos en la misma transacción (cuarentena→almacén y almacén→piso, cada uno con su marca): el segundo es una bajada de verdad (el mismo par de
   lugares que «Bajar al piso»), así que Frescura cuenta la edad de la prenda desde ese momento. «No se pudo» la deja en la lista, ya no «en
   arreglo», para decidir su destino (liquidar, botar, donar o volver a sacarla).
6. **Aviso a los 7 días**: la fila de dañadas de «Para hoy» sube a rojo cuando alguna lleva 7 días o más separada **sin salir a arreglar** (las que
   alguien tiene afuera no cuentan). `lib/danadas-arreglo.ts::contarDanadasViejas`.
7. **Foto opcional** (`20261029034000` tabla y funciones; `20261029045000` bucket y políticas, aparte por ADR-0195): se sube DESPUÉS de reportar
   (con la dañada ya guardada; si falla, la prenda queda reportada y se avisa). Bucket privado `retail-danadas`, hasta 3 fotos de 10 MB, solo
   imágenes, enlaces firmados de 1 hora. La tabla tiene RLS encendido y ninguna política: solo se lee y se escribe por funciones.
8. **Cierre**: pruebas de Postgres (66), pruebas de reglas (unitarias), guías (`inventario`, `inicio`, `vender`), 4 escenarios de modo oscuro, y
   verificación en el navegador de punta a punta (reporte con foto, «Se arregló» al piso con costo, los dos botones, a 375 px).

## Qué se descartó

- **Un envío formal «a arreglar»** (lista, salida, llegada): la respuesta fue «las lleva quien pase por el almacén». Dos toques sueltos bastan.
- **Mover la prenda a una sububicación «en arreglo» o «taller»**: obligaría a dos movimientos más por cada vuelta y a que Frescura, Movimientos y
  el conteo las entiendan. La prenda no sale del inventario de la sede mientras está fuera; la fila dice dónde está.
- **Un botón más en la cabecera de Existencias**: Felipe quitó los botones de esa cabecera a propósito (2026-10-05); la entrada de las cuentas de
  caja y almacén vive en SUS pantallas.
- **Un asiento en Finanzas por el costo del arreglo**: es dinero y es otra decisión. Hoy el monto solo se anota en la prenda.
- **Dos versiones de la misma función** (de 6 y de 7 parámetros): una llamada de 6 coincidiría con las dos y PostgREST diría «no es única». Con un
  parámetro por defecto, la web vieja y la nueva llaman a la misma.
- **Solo el líder** en «Salió a arreglar»: era lo que decía el plan, pero ADR-0534 ya quitó esa validación a resolver y liquidar, y las cuentas de
  almacén y caja —las que llevan la prenda— nunca son líder.

## Lo que no se puede pasar por alto

- **El rol de la caja tiene que ver Existencias.** El botón sale solo si el rol ve ese módulo (ADR-0161: nunca se asigna un módulo a un rol desde el
  código). En la base local el rol «terminal de ventas» NO lo trae. Dárselo es decisión de Felipe en Colaboradores ▸ Roles y accesos, y es más que un
  botón: esa cuenta pasaría a ver toda Existencias.
- **Las funciones cambiaron de firma** (`reportar_danada` de 6 a 7 parámetros, `arreglar_prenda_danada` de 3 a 5, ambas con parámetros por defecto).
  Volver a pegar `20261005140000` (o una migración anclada a la firma vieja) las deja duplicadas; está dicho en el «SE ROMPE SI» de cada migración.
  `scripts/pruebas/inventario_token_y_textos.mjs` apunta ahora a la firma vigente.
- **Una prenda «en arreglo» sigue contando en el inventario de la sede** (en la cuarentena). Si un día se quiere ver el stock «fuera de la tienda»
  como cifra aparte, es una decisión de modelo, no un parche.

## Cómo se pega en producción (orden y partes; ninguna está pegada)

Cada archivo en el SQL Editor, por separado y en este orden, ANTES de publicar la web: `20261029024000`, `20261029031000`, `20261029032000`,
`20261029033000`, `20261029034000` y, SOLO, `20261029045000` (bucket y políticas: ADR-0195). Cada una es idempotente y trae su sonda de verificación.
Si la web sale primero, nada se cae: las lecturas nuevas nunca lanzan (sin la columna o la función, la lista sale como antes) y solo falla lo nuevo
al usarse. `docs/datos/generado/` se refresca cuando se apliquen en producción (`generado/COMO-REFRESCAR.md`).

## Se rompe si

- alguien llama a `reportar_danada` o `arreglar_prenda_danada` con parámetros posicionales en otro orden (se llama siempre por nombre);
- el bucket `retail-danadas` no existe donde se publica: subir la foto avisa «La prenda quedó reportada, pero la foto no se pudo subir» y sigue;
- una cuenta con el módulo Existencias retirado intenta el botón: la base contesta 42501 y la pantalla lo dice (no se ofrece el botón sin el módulo).
