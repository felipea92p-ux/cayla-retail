# ADR-0581 · Cambiar el tipo de una orden abierta (muestra ↔ lote de producción)

- **Fecha:** 2026-10-30 · **Estado:** construido y probado en una base privada con las 981 migraciones de `main` + esta (`pnpm pruebas:produccion-cambiar-tipo`, 25 casos; la pantalla, a 375 px y en escritorio). **Migración sin pegar en producción** (`20261030151000`). El script de datos de las tres órdenes (`pegar-en-produccion-tipo-de-ordenes-2-3-4-2026-10-30.sql`) tampoco está pegado.
- **Decide:** Felipe, 2026-10-30: de las tres opciones eligió «Datos y cambio de tipo» (corregir las tres órdenes y dar el botón), y NO la tercera (quitar el valor de fábrica «muestra» del modelo nuevo).
- **Toca:** ADR-0396 (Nueva orden: «un modelo nuevo arranca como muestra»), ADR-0570 (historia de la orden), ADR-0384 (precio 0 solo en empaque).

## El problema primero

El 2026-10-27 el Taller abrió OP-000002, 003 y 004 (16, 54 y 69 prendas) con «Crear un modelo nuevo». Ahí el formulario arranca en «Muestra» —lo decidió el ADR-0396— y la línea junto al
interruptor dice «Es un modelo nuevo, así que arranca como muestra. ¿Ya tienen el molde? Entonces elige Lote de producción». Nadie movió el interruptor y la base guardó `es_muestra = true`. Eran lotes.
Se leyó en producción (solo lectura): los tres modelos nacieron en el mismo instante que su orden, y el registro de Actividad anotó «(muestra)» al abrir cada una; el Chaleco (OP-000001, un modelo
que ya existía) salió como lote.

Lo que cuesta ser muestra sin serlo: al cerrarse, la orden **no entra al stock ni toca el costo de la prenda** (`cerrar_produccion`), Análisis no cuenta sus prendas como «en camino»
(`fn_analisis_pedido_en_camino`) y «Al stock este mes» tampoco. OP-000002 ya estaba «Lista para pasar al stock»: cerrarla así dejaba 16 prendas fuera de todo estante. Y **no había salida**: ninguna
función de la base cambiaba `es_muestra` después de abrir la orden; un clic mal puesto era para siempre, salvo con SQL a mano. Eso no es un error de quien abrió la orden: es un estado que el
sistema deja crear y no deja corregir (principio 2).

## Qué se decidió

1. **`cambiar_tipo_orden_produccion(orden, es_muestra, motivo?)`** (migración `20261030151000`): pasa una orden **en proceso** de muestra a lote o al revés. Quien opera la orden (módulo Producción en ese Taller, como
   «Anular»): no es solo del líder, porque el error nace en el Taller y esperar a un líder repite el problema. El motivo es opcional y, sin él, la historia dice igual qué cambió.
2. **De muestra a lote exige el precio a tienda de cada talla y color** de la orden (la regla de «Crear un modelo nuevo»: «una producción necesita el precio; una muestra no»), salvo categorías de
   empaque (ADR-0384). Sin precio, el lote cerraría y entraría al stock sin poder venderse.
3. **Todo o nada y con rastro:** el cambio y su fila en `produccion_cambios` (acción nueva `tipo`, con `antes` y `despues` = `{es_muestra}`; el CHECK exige los dos y que sean distintos) y su anotación en la
   Actividad van en la misma transacción. La historia de la orden lo cuenta («Pasó de muestra a lote de producción · Por qué: …»).
4. **Pedir el tipo que ya tiene no hace nada** ni falla ni escribe (un doble clic, o dos personas con la misma idea): responde `{cambio: false}` y la pantalla lo dice.
5. **Pantalla:** en la cabecera de la orden, mientras está abierta, «Pasar a lote de producción» (si es muestra) o «Pasar a muestra» (si es lote), junto a «Anular orden». La hoja (`CambiarTipoModal`) dice
   qué cambia al cerrar —el stock y lo que Análisis cuenta «en camino»—, avisa de antemano si la prenda no tiene ningún precio, pide solo quién lo hace (motivo opcional) y confirma con un botón corto
   («Pasar a lote») porque en el celular el pie son dos mitades. Mientras la orden siga abierta se puede volver a cambiar. Reglas puras y probadas en `lib/orden-tipo-reglas.ts`.
6. **Las tres órdenes de producción** se corrigen con un script de una sola vez, no con la función (en el SQL Editor no hay una cuenta que firme): ensayo por defecto, foto de cada fila en
   `respaldo_purgas.filas` antes de cambiar, todo o nada, se detiene si alguna ya no está en proceso o no tiene precio, y el camino de vuelta escrito dentro. Anota en la Actividad sin responsable.

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** una función propia con su acción «tipo» en la historia, igual que `permitir_pasar_sin_tela` hizo con «sin_tela», y dejar el valor de fábrica «muestra» del modelo nuevo como está.

**DESCARTÉ:**
- Dejarlo como una «nota» de la historia: una nota es texto libre y no se puede consultar «qué órdenes cambiaron de tipo y de cuál a cuál».
- Solo para el líder: la orden queda mal mientras se espera.
- Un `update` suelto por orden desde el SQL Editor: sin rastro en la orden y sin salida para la próxima.
- **Quitar el valor de fábrica «muestra» en el modelo nuevo** (la tercera opción que Felipe no eligió): obligaba a elegir el tipo en cada modelo nuevo, un clic más para siempre, y deshacía una decisión del ADR-0396.
  Queda pendiente de ver si, con el botón, el error vuelve a repetirse; si se repite, esa es la siguiente decisión.

**SE ROMPE SI:** dos personas piden tipos opuestos de la misma orden en el mismo segundo (gana el último; los dos quedan en la historia; probado con dos sesiones reales); alguien cierra una orden como muestra
ANTES de pegar el script (las 16 prendas de OP-000002 no entran al stock y el botón ya no sirve: una orden cerrada no cambia de tipo, hay que «Revertir el cierre» primero); o una rama nueva vuelve a escribir el CHECK de
`produccion_cambios` sin la acción «tipo» (la prueba lo detecta). Repegar `20261029190000` cuando ya existe algún cambio «tipo» falla en voz alta con `23514` y no pierde nada: se resuelve repegando esta.

**Actualización 2026-10-31 (candados con `paso_tarde`):** #1508 (ADR-0586, `20261031002000`, ya en producción) reescribe los mismos dos CHECK de `produccion_cambios` para sumar la acción `paso_tarde`, y lleva `tipo` con la forma de esta
migración. Producción quedó entonces con los dos candados de #1508 y el check «SQL pegado» de este PR dijo «FALTA…o allá está con otra versión» (la función `cambiar_tipo_orden_produccion` sí coincidía). Se hizo lo que pide el ADR-0251: esta
migración trae al archivo lo que ya vive en producción —los dos CHECK llevan también `paso_tarde`, con el texto de #1508— y no escribe ninguna fila `paso_tarde`. **SE ROMPE SI:** una tercera acción se suma a esos CHECK en otra
migración y esta se repega después sin ella (la prueba de cada una detecta la acción que le falta).

## Cómo se ve en producción al aplicarlo

1. **Pegar primero el script de datos** (urgente: OP-000002 está lista para cerrarse). Por defecto ensaya y termina en «ENSAYO_OK …»; con el resultado esperado, `false` → `true` en la línea APLICAR. No depende de la migración.
2. Después la migración `20261030151000` (una sola parte, re-ejecutable) y, cuando la web nueva esté publicada, el botón aparece. Mientras la web publicada sea la vieja nada cambia: ninguna pantalla vieja llama a la función.
3. Al cerrar cada una de las tres como lote, la base pide lo que pide a todo lote: confirmar el costo si sale fuera de banda (no declararon tela, así que hoy saldría en cero) y, si la orden declaró tela, anotarla.

## Cómo se verificó

- `pnpm pruebas:produccion-cambiar-tipo` (25 casos, con ROLLBACK): el cambio en los dos sentidos con su rastro, repetir no hace nada, ir y volver, la página lo lee, los rechazos (cerrada, sin precio, motivo largo, tipo vacío,
  orden inexistente, otra sede), el efecto (una muestra que pasa a lote **entra al stock** al cerrar; una que sigue muestra, no), el CHECK de la historia, permisos, que se pueda pegar otra vez y el script de datos (ensayo,
  aplicar, repetir, parar si una orden se cerró o no tiene precio, y el camino de vuelta). **Prueba de mutación:** se rompió la función y el script de ocho formas distintas y la prueba se puso roja cada vez.
- **Corrección del mismo día (30-oct, tarde), hallada por otra sesión y comprobada en producción con un SELECT:** el control de precio armaba la lista de tallas sin precio con `sku`, y en producción solo 1 de 3 179 variantes tiene `sku` (3 178 usan `codigo`). La lista salía nula, y nula se leía como «no falta ninguna»: el control **nunca rechazaba**. Mis pruebas no lo vieron porque el seed local sí trae `sku`. Ahora nombra la talla con `coalesce(codigo, sku, 'sin código')`, como el resto de la base, y la prueba siembra las tallas como en producción (con `codigo`, sin `sku`) y suma un caso para una talla sin ninguno de los dos (25 casos; contra el SQL anterior, la misma prueba da 21/25). Aún no estaba pegada en producción. La causa real del hueco: **un dato de prueba que no se parece al de producción** —el mismo origen del error de fondo, un valor supuesto en vez de leído—.
- **Concurrencia con dos sesiones reales:** el mismo pedido dos veces (la segunda esperó ~2 s al candado de la orden y no escribió nada) y pedidos opuestos (los dos se aplicaron en orden; tres filas en la historia; el CHECK
  impide un antes igual al después).
- En el navegador, con login real contra la base privada: el botón, la hoja en los dos sentidos, el aviso de éxito, la historia («Pasó de muestra a lote de producción · Por qué: …»), el rechazo por precio con el código de la
  talla que falta, y 375 px (se vio el botón de confirmar cortado, se acortó a «Pasar a lote»).
- Lo demás, sin romperse: `pnpm pruebas:produccion-*`, `roles-cobertura`, `knip`, los verificadores de migraciones y los 745 archivos de pruebas de la web (164 656 pruebas) quedaron en verde. Tres pruebas viejas
  de Producción (`tela-al-cortar`, `catalogo-de-procesos`, `fases`) salieron rojas en la base donde yo había confirmado filas de prueba (suponen una base sin órdenes confirmadas; `tela-al-cortar` vuelve a cargar la
  migración anterior encima de filas «tipo»); repetidas en una base nueva con las 981 migraciones, pasaron las tres.
