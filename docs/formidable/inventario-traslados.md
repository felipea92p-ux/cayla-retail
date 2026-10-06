# Formidable · Inventario ▸ Traslados   (`/inventario/traslados`, `/inventario/traslados/[id]`)

- **Fecha / SHA:** 2026-10-06 · `1cdb20d4` (rama `claude/simular-traslados-sedes-999c9c`) · **Dispositivo que manda:** escritorio para enviar y
  revisar; celular o tablet con la caja abierta para recibir.
- **Pregunta que debería resolver (1 frase):** «¿Qué caja me toca y qué hago con ella?» · **Protagonista:** la caja (y sus prendas).
- **Veredicto en una línea:** «Se entiende en 5 s qué es y qué toca; al comparar lo contado, una diferencia se siente como un error de quien
  contó, y dos indicadores (el anillo y el botón gris) no se entienden.»
- **Escala de esta corrida:** medición del DOM a 3 anchos (sin agentes) y **una** prueba ciega (1 agente, Sonnet, sobre 4 capturas en orden). Sin
  revisor de leyes ni escéptico en agente: el escéptico lo hice yo sobre las capturas y el código (ver «Refutados»).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: a los 5 s dijo «cajas entre sedes, me toca abrirla y contar»; completó la tarea en 6 toques, 0 errores · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] 2 botones primarios a la vista: «+ Nuevo traslado» (cabecera) y el del pase |
| 3 Simplicidad profunda | 6 | [Observado] «FALTÓ 1 BLUSA EMMA M BEIGE» + «espera a un líder» la hizo pensar que se equivocó al contar |
| 4 Lenguaje de tienda | 6 | [Observado] no entendió «3/4 · Llevas 3 hechas»; dudó con «Sigue aquí» y con la raya «—» (¿cero o vacío?) |
| 5 Contenido primero | 8 | [Opinión] la ruta en letras grandes y las prendas con su color mandan; el texto es corto |
| 6 Lo difícil, a un toque | 7 | [Opinión] lo que pasa al confirmar está escrito antes de apretar; no hay «¿Por qué?» para el anillo |
| 7 Perdonar antes que preguntar | 8 | [Medido] contar es reversible (− / +, «Volver a contar», se guarda solo); confirmar es lo único sin vuelta y se ve antes |
| 8 Quitar antes de agregar | 7 | [Observado] «Guardado» bajo cada casilla le hizo dudar de para qué sirve «Terminé de contar» |
| 9 De punta a punta | 7 | [Medido] auditor del tema en 0 (claro y oscuro, 375 px); [Medido] «Todas las cajas» mide 23 px de alto en celular |
| **Leyes (promedio)** | **7,0** | ninguna ley bajo 6 |
| **Oficio visual** | **6** | [Medido] del pase: radios distintos (13 en la página, varios del pase), 2 primarios, «Todas las cajas» 128×23 a 375 px. Lo demás que falla (botón «Salir» 16 px, «Buscar…» 4,15:1, «Ctrl»/«K» 3,32:1, textos de 10–11 px de la cabecera) es del marco global, no de esta pantalla |

## Los 3 cambios de mayor impacto (esperan tu OK; ninguno toca dinero, stock, permisos ni SUNAT)
1. **Comparar sin culpa.** Antes: «FALTÓ 1 BLUSA EMMA M BEIGE» y «1 prenda con diferencia espera a un líder». Después: debajo del título, una frase
   que dice qué hacer: «Búscala otra vez en la caja. Si no está, confirma: tu líder lo revisa con Trujillo.» y el resumen en dos líneas cortas
   («Entra 1 al piso» · «1 queda para revisar»). **Ley 3 y 4.** Se verifica repitiendo la prueba ciega: que no diga «me equivoqué». Esfuerzo S.
2. **El botón gris que no es botón.** Antes: «Faltan 2 por contar» como botón apagado. Después: mientras falte contar, el pie dice «Te faltan 2:
   Blusa Emma M · Blusa Emma L» (tocables, ya existen) y el botón «Terminé de contar» aparece recién cuando todo tiene número. **Ley 1 y 9.**
   Se verifica con la prueba ciega (que no lo toque esperando algo) y con `pnpm focus`. Esfuerzo S.
3. **El anillo en palabras.** Antes: «3/4 · Te toca 1 cosa hoy · Llevas 3 hechas». Después: «Te toca 1 caja hoy» y, debajo, «Ya hiciste 3 de 4».
   **Ley 4.** Se verifica con la prueba ciega. Esfuerzo S.

## Lo que sobra (ley 8)
- «Guardado» debajo de cada casilla mientras se cuenta: proponer mostrarlo solo si NO se guardó («No se guardó · reintentar»), que es lo que importa.
  (El guardado por casilla se queda: solo se esconde la confirmación de que salió bien.)

## Lo que no pediste y importa más
La pasada con una colaboradora real en Lima o Trujillo, con una caja de verdad: el agente leyó capturas y no tuvo la caja en la mano ni la pistola.

## Lista aparte (no se ejecuta)
- «Todas las cajas» (volver a la billetera en celular) mide 23 px de alto: llevarlo a 44 px de blanco con dedo.
- Dos primarios a la vez (cabecera + pase): proponer «+ Nuevo traslado» como secundario en esta pantalla.
- La raya «—» de la casilla sin contar se lee como «cero»: un «?» o la casilla vacía con borde punteado.
- En comparar, el aro lleno en ámbar parece un círculo vacío.
- Los radios del pase (24, 18, 14, 12, 10, 9, 6) podrían reducirse a tres.

## Refutados
- «El botón rojo "Confirmar lo que llegó" parece advertencia»: REFUTADO. En la captura el mouse había quedado sobre ese botón (Playwright acababa de
  tocar «Terminé de contar» en el mismo lugar) y `btn-primario` se pinta `rojo-profundo` solo al pasar el mouse; en reposo es tinta.
- «Venían 2 y yo conté 1: el sistema está mal»: la tarea del ciego decía 1 y la caja traía 2 a propósito; la pantalla hizo lo correcto (decirlo).
  Lo que sí queda es cómo lo dice (cambio 1).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | **Pasa**: «cajas entre sedes; me toca abrirla y contar» |
| Primer intento | **Pasa**: llegó a «Confirmar lo que llegó» sin retroceder |
| Pasos | 6 (mínimo 4–5: abrir, + , +, terminé, confirmar; tocó «Al piso» aunque ya estaba marcado) |
| Dudas | 10 — «Si ya llegó, ábrela…» vs «llega mañana», «3/4», «Faltan 2 por contar» (gris), «Lo que venía aparece al final», «—», «Sigue aquí», «Guardado», «Faltó 1…», «Al piso/Al almacén» (¿para todas?), el rojo (refutado) |
| Palabras no entendidas | «3/4», «Llevas 3 hechas»; dudosas: «Sigue aquí», «espera a un líder», «ábrela» |
| Errores evitables | 0 |

## Antes de decir «listo»
- **Concurrencia:** dos personas cuentan la misma caja: cada casilla se guarda sola y la base guarda la última; confirmar dos veces lo frena la base
  (estado) y anular lleva token contra el doble clic (ADR-0190). Sin probar con dos aparatos a la vez.
- **Caída externa:** si una casilla no se guarda, queda en pantalla «No se guardó · reintentar» y se reintenta al volver la red; los pedidos y los
  nombres se leen tolerantes (la billetera sale sin ellos). Probado: el error de la base al enviar un pedido sin stock en el almacén se muestra y no
  pone el sello.
- **Persona sin contexto:** la prueba ciega de arriba (agente). Colaboradora real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-06 | `1cdb20d4` | 7,0 | 6 | — (primera corrida; los 3 cambios esperan el OK) |
