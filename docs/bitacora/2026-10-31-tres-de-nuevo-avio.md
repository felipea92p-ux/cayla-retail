# 2026-10-31 — Tres cosas de «Nuevo avío»: el nombre cortado, el cartel que mentía y el botón sin línea

**QUÉ HICE.** Los tres hallazgos que quedaban de `/chaos` sobre esta hoja:

1. **Una clase de avío con nombre largo ya no se crea cortada.** El API la recortaba a 60 letras **en silencio** y el
   aviso de éxito mostraba el nombre mutilado como si fuera el que se pidió. Ahora lo dice: «El nombre de la clase
   llega hasta 60 letras y este tiene 106: acórtalo».
2. **El cartel «todavía no se creó… se pierde lo que escribiste» ya no sale mientras se está creando.** Antes, con la
   escritura en camino, se podía pulsar «Salir sin guardar» y el avío se creaba igual.
3. **Un botón sin medida se puede registrar.** El diseño y la base siempre lo aceptaron; la pantalla no dejaba.

**POR QUÉ ASÍ, uno por uno.**

**El nombre.** Cortar lo que alguien escribió sin decírselo es peor que no dejarlo crear: de esa clase sale el
prefijo del código de **todos** sus avíos (`CIN-`), así que el recorte se queda para siempre. La regla vive donde
viven las demás reglas de clase (`avio-clases-reglas.ts`), con su límite y su mensaje, y el API la usa en vez de
cortar por su cuenta.

**El cartel.** El ERP no puede afirmar lo que no sabe, y menos en el momento en que la persona decide — es lo
contrario de la frase honesta que la misma hoja usa para un corte de red («no podemos confirmar si llegó a
guardarse»). No hizo falta pieza nueva: `<Modal bloqueado>` ya existe para esto, y el botón «Cancelar» se apaga
mientras guarda.

**La medida.** Era una línea: `const escrita = e.medida.trim() !== "" || e.medidaUnidad !== "";`. Al elegir la clase
se rellena la UNIDAD sola, así que la validación tomaba «hay unidad» por «hay medida escrita» y pedía un número que
el diseño declara opcional (`COMPORTAMIENTOS.pieza.requerida = false`). **La consecuencia era de negocio, no
cosmética:** quien no sabía la línea del botón inventaba un número, y ese número entra en el nombre de la ficha y
en su identidad para siempre. Ahora solo la caja cuenta como medida escrita.

---

## Cómo se verificó

Primero las pruebas, y fallaron (4 de 7 en rojo). Después el arreglo, y las 7 en verde. En la hoja, con login real
en el Taller:

| Lo que probé | Antes | Ahora |
|---|---|---|
| Clase «Botón», medida vacía, un color | el botón de guardar apagado y «La medida es un número mayor que cero» | se guarda: `BOT-01 · Botón nácar sin línea · medida=(ninguna)`, y su color se llama sin número inventado |
| Crear una clase de 106 letras | se creaba con 60, partida a media palabra | no se crea nada (siguen 7 clases) y la hoja dice «El nombre de la clase llega hasta 60 letras y este tiene 106: acórtalo» |

**165 225 pruebas** en verde (776 archivos), `typecheck`, `knip`, `knip:produccion`, `lint`, y `pruebas:materiales`
143/143 con los cambios puestos.

**Lo que NO verifiqué en pantalla, y queda dicho:** el cartel mientras guarda (hallazgo 2). Para provocarlo hay que
retrasar la RPC a propósito, como hizo `/chaos`. El arreglo usa `bloqueado`, una propiedad que `<Modal>` ya tenía
documentada para exactamente esto («Escape, el velo y la ✕ no cierran mientras guarda»), y el «Cancelar» se apaga
con el mismo estado que ya apaga el botón de guardar — pero no lo vi funcionando.

## Con esto, «Nuevo avío» queda sin hallazgos abiertos de aquella corrida

Los ocho de `/chaos` del 31-oct: el pegado de celdas (#1535), los invisibles (#1542, en producción), medio botón
(#1546, en producción), el Enter (#1551) y estos tres. El noveno era un mensaje que culpa al rol equivocado
(gravedad 4) y sigue en el backlog.
