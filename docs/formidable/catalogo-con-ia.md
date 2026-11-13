# Formidable · Catálogo ▸ «Catálogo con IA» en Editar y Nuevo producto   (`/productos/[id]/editar`, `/productos/nuevo`)

- **Fecha / SHA:** 2026-11-13 · `470d746d7` · **Dispositivo que manda:** escritorio (Mac mini), 375 px medido
- **Pregunta que debería resolver:** «¿Cómo dejo la foto de esta prenda limpia, de catálogo, y vuelvo a la mía si no me gusta?» · **Protagonista:** la prenda
- **Veredicto en una línea:** la hoja se entiende al toque, pero la persona que trabaja desde el panel grande no ve lo que pasa: lee «Sin foto todavía»
  mientras se prepara, y «Usar mi foto» está en una sección cerrada. Además hay un error de verdad: la foto «para todos los colores» sale forzada a la forma de otro color.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 | [Observado] ciego: no completó sin retroceder; 7 dudas; «No lo vi en la captura 5, que es donde estaba mirando la blusa arreglada» · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Medido] el panel grande y la tarjeta de «Fotos» dicen cosas distintas del mismo color a la vez |
| 3 Simplicidad profunda | 7 | [Observado] «Preparando…» y «Con IA» se leen como veredicto; los contradice «Blanco · Sin foto» debajo (`FotosPorColor.tsx:368`) |
| 4 Lenguaje de tienda | 6 | [Medido] la foto «para todos los colores» se titula «Sin color»; «Se sube tal cual la entregas» con la IA encendida; el «?» dice 0,05 USD y la hoja 0,06 |
| 5 Contenido primero | 5 | [Medido] en Nuevo el resultado se ve a 34×42 px y, con foto de IA, desaparece «Ver o quitar las fotos» (`MatrizVariantes.tsx:158-175`); el panel no muestra la foto que se prepara (`PanelDelTaller.tsx:113-122`) |
| 6 Lo difícil, a un toque | 7 | [Medido] el «?» de «Fotos por color» explica; falta verlo (sin ejemplo antes → después) |
| 7 Perdonar antes que preguntar | 6 | [Medido] «Usar mi foto» existe y no pregunta; pero en Editar salir a mitad pierde la foto pagada sin aviso (`ProductoForm.tsx:824`, `hayCambios` no la cuenta) |
| 8 Quitar antes de agregar | 7 | [Medido] la hoja es corta (nombre + una línea por casilla); sobra la línea «Se sube tal cual» y el costo repetido en el «?» |
| 9 De punta a punta | 5 | [Medido] molde mal aplicado a «todos los colores» (`useCatalogoIA.tsx:129,207`); letra de 11 px en la fila de Nuevo; a 375 px el costo cae bajo los botones |
| **Leyes (promedio)** | **6,0** | ninguna ley bajo 5 |
| **Oficio visual** | **8** | [Medido] hoja a 1440: contraste 0 fallas, espaciado en escala, 1 acción principal (lo marcado eran `input.sr-only` y versalitas de `campo-etiqueta`); falla la letra de 11 px de la fila de Nuevo (`text-[11px]`, `scale-90`) |

## Los 3 cambios de mayor impacto
1. **El panel grande dice la verdad y deja volver** (H1, H5). Antes: mientras prepara, «Sin foto de Blanco todavía» con un chip chico; al terminar, ni «Con IA» ni
   «Usar mi foto» a la vista. Después: el panel muestra la foto real atenuada con el hilo y «Preparando…»; al terminar, «Con IA» y «Usar mi foto» sobre la foto
   del panel; la tarjeta dice «Preparando…», no «Sin foto». Leyes 1, 3, 5, 7. Se verifica: el mismo recorrido, el panel nunca dice «Sin foto» mientras prepara. S. Presentación.
2. **Que no se pierda ni se deforme** (H9, H3). Antes: salir de Editar a mitad pierde la foto sin aviso; la foto «para todos los colores» se pide con el molde de
   Blanco y se titula «Sin color». Después: lo que se prepara cuenta como cambio sin guardar (sale el aviso de salida y «Revisar y guardar» espera a que llegue);
   la foto general se pide sin molde y su hoja se llama «Todos los colores». Leyes 7, 9, 4. Se verifica: «Volver» a mitad pregunta; la hoja general no muestra
   «Misma forma que…». M. Presentación y comportamiento de la pieza (no toca dinero, stock ni permisos).
3. **En Nuevo, ver el resultado grande** (H4, H10). Antes: miniatura de 34×42 px y con IA se pierde «Ver o quitar las fotos»; textos de 11 px. Después: la
   miniatura con foto abre la vista grande, «Con IA · Usar mi foto» van al lado, y la fila usa la letra de lectura (14 px). Ley 5. Se verifica: tocar la miniatura de
   un color con IA la muestra grande; el medidor no marca texto bajo 14 px en la fila. S.

## Lo que sobra (ley 8)
- «Se sube tal cual la entregas.» bajo «Fotos por color» con la opción encendida: deja de ser cierto; se dice solo con la opción apagada.
- «0,05 USD por foto» en el «?»: el costo ya va en el pie de la hoja, junto al botón que lo gasta, y con la cifra correcta.

## Lo que no pediste y importa más
Con la opción encendida, nada en el panel grande dice que la IA está prendida: la colaboradora agrega su foto ahí «sin saber que existía Catálogo con IA»
(ciego, error 1) y la sorpresa es la hoja. El botón del panel podría llevar la ✦ cuando la opción está encendida, como el interruptor.

## Lista aparte (no se ejecuta)
- Ejemplo antes → después en la hoja (ley 5/6, opinión; el «?» ya lo explica con palabras).
- «Escote y caída.» bajo Espalda: describe lo que aprovecha la IA, no qué fotografiar («Desde atrás, entera.»).
- El costo en USD le da miedo a una colaboradora («me da algo de miedo apretarlo») — está así por decisión de Felipe («Poco texto a la vista»); si molesta, decide él.
- A 375 px el «~25 s · 0,06 USD» queda bajo los botones.
- Los dos párrafos largos de la sección «Fotos» (no son de esta pieza; van contra «Poco texto a la vista»).
- «Tienes 2 cambios sin guardar» tras una sola foto (el par cuenta doble) — confundió al ciego.

## Escéptico
H1 confirmado · H2 confirmado · H3 confirmado y peor (el molde se envía de verdad) · H4 confirmado y peor (desaparece «Ver») · H5 confirmado · H6 matizado ·
H7 matizado · H8 refutado como regla (el costo en el pie lo pidió Felipe), con dos defectos reales al lado (cifra del «?» y 375 px) · H9 nuevo (salir a mitad;
verificado en `ProductoForm.tsx:824`) · H10 nuevo (11 px) · H11 nuevo (párrafos, fuera de la pieza).

## Prueba ciega
Sonnet, sobre 8 capturas, sin repo.

| Medida | Resultado |
|---|---|
| Lectura de 5 s | «Pantalla de la blusa donde subo fotos por color y hay un interruptor 'Catálogo con IA' que no sé qué hace» — coincide a medias |
| Primer intento | No: tuvo que abrir «Fotos» y bajar para hallar «Usar mi foto» |
| Pasos | 3 toques para encontrar cómo volver |
| Dudas | 7 («Catálogo con IA», «Preparar foto», «Principal/Nueva», «Usar mi foto»…) |
| Palabras no entendidas | «Escote y caída», «~25 s · 0,05 USD» (a quién se cobra), «Pendiente de revisión» |
| Errores evitables | 5 (no saber de la IA desde el panel; creer que no funcionó por «Sin foto todavía»; no ver «Usar mi foto»; apretar dos veces por miedo; «Se sube tal cual») |

## Antes de decir «listo»
- Concurrencia: dos personas en la misma ficha — sin probar (la ficha tiene su candado de versión al guardar; la foto preparada es local hasta guardar).
- Caída externa: OpenAI caído → queda la real y avisa (probado con /chaos el 2026-11-13).
- Persona sin contexto: ciega sobre capturas ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-13 | 470d746d7 | 6,0 | 8 | — (3 propuestos, esperan OK) |
