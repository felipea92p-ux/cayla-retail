# Formidable · Inventario ▸ Rótulos de anaquel   (`/rotulos`)

- **Fecha / SHA:** 2026-10-09 · a93d23eb   · **Dispositivo que manda:** escritorio (laptop del almacén / Mac mini); 375 px se adapta
- **Pregunta que debería resolver:** «¿Qué papel pego en este anaquel para saber de lejos qué prendas hay ahí?»   · **Protagonista:** el rótulo (lo que va a salir impreso)
- **Veredicto en una línea:** «Se entiende en 5 s y se completa en 5 toques. El rótulo, que es lo que importa, queda debajo del pliegue y a 375 px sale cortado.»

**Cómo se midió.** El panel del navegador integrado estaba oculto, así que la medición (`medir-oficio.js`) y las capturas se hicieron con Playwright
headless (sesión local de `felipe@cayla.local`, Tienda Lima) a 1440×900, 1024×768 y 375×812, en claro y oscuro (1440). Los defectos del chrome
global (Salir 16 px de alto, «Ctrl K» a 3,3:1, textos de 10–11 px del lateral) se reportan aparte y no bajan la nota. El texto de 9 px y los huecos
de 4,5/7,5 px son del **papel** dibujado a tamaño real (milímetros), no de la interfaz: no cuentan.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego sobre capturas: a los 5 s dijo «pantalla para armar un letrero para pegar en un estante» y que seguía la caja de buscar; terminó en 5 toques. Dudas en el aviso del ayudante de Mac y en «modelo». · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] 1 acción primaria (`accionesPrimarias: 1`); el título es el nombre de la pieza, no la pregunta |
| 3 Simplicidad profunda | 9 | [Medido] nada crudo: el rótulo ES el veredicto; «Imprimir 1 rótulo» cuenta solo |
| 4 Lenguaje de tienda | 7 | [Observado] «modelo» confundió al ciego («pensé que era una persona»), n=1; el aviso de Mac habla de «Terminal», «instalar.sh \| sh», «red local» |
| 5 Contenido primero | 5 | [Medido] orden: cabecera → aviso Mac → tarjeta de elegir → vista previa; a 1024×768 el rótulo queda bajo el pliegue; a 375 px a ~1000 px de scroll |
| 6 Lo difícil, a un toque | 6 | [Medido] la guía está a un toque, pero el aviso técnico del ayudante está siempre abierto |
| 7 Perdonar antes que preguntar | 9 | [Medido] nada irreversible: imprimir es papel; quitar una prenda se deshace volviendo a buscarla; sin «¿seguro?» |
| 8 Quitar antes de agregar | 7 | [Medido] «Guía de impresión» dos veces (cabecera y nota), heredado de Etiquetas de precio |
| 9 De punta a punta | 6 | [Medido] vacío bien hecho (`<Vacio>` con la acción); a 375 px el rótulo y «Copias» se cortan a la derecha; el buscador ofrece la «Prenda sin Registrar» interna |
| **Leyes (promedio)** | **7,1** | ley 5 en 5 |
| **Oficio visual** | **7** | [Medido] 7 pasan (blancos, contraste, texto, escala, rojos, foco 2 px en todos los controles, orden de Tab) · 3 fallan: vista previa cortada a 375 px, píldoras y combo desalineados 2 px, 7 radios distintos (3 son del papel) |

## Recalificación tras los 3 cambios (2026-10-09, OK de Felipe)
| Eje | Antes | Después | Evidencia |
|---|---|---|---|
| 4 Lenguaje de tienda | 7 | 8 | [Medido] lo que se ve del aviso de Mac es «Puedes imprimir igual…», sin «Terminal» ni el comando (prueba en `mac-etiquetas.test.ts`); «modelo» sigue (lista aparte) |
| 5 Contenido primero | 5 | 8 | [Medido] desde 1024 px el rótulo va a la derecha y entero a la vista: a 1024×768 termina en y=586, a 1440×900 en y=530 |
| 6 Lo difícil, a un toque | 6 | 8 | [Medido] el detalle y la línea de Terminal se abren con «Ver cómo» |
| 9 De punta a punta | 6 | 8 | [Medido] a 375 px el rótulo se achica para caber (borde derecho 359 de 375; Copias, también); el buscador ya no ofrece «Prenda sin Registrar» ni productos de prueba |
| **Leyes (promedio)** | 7,1 | **8,0** | ley 1 sigue en 7 (ciego sobre capturas; real sin probar) |
| **Oficio visual** | 7 | **8** | [Medido] sin desborde a 375 px; siguen fallando 2–3 px de desalineación en las píldoras y 7 radios (3 del papel) |

Sin volver a correr el ciego: la ley 1 no se recalifica. Etiquetas de precio cambió con el aviso compartido (misma línea y «Ver cómo»): sigue montando
su hoja de impresión (41 etiquetas, medido) y su botón dice «Imprimir 41 etiquetas».

## Los 3 cambios de mayor impacto (hechos el 2026-10-09 con el OK de Felipe)
1. **El rótulo primero y entero.** Antes: el rótulo va al final, bajo el aviso y la tarjeta de elegir, y a 375 px sale cortado. Después: en escritorio
   ancho, dos columnas como Etiquetas de precio (a la izquierda qué prendas y cómo salen; a la derecha los rótulos, pegados arriba); en angosto, la
   vista previa se escala para caber (el papel impreso no cambia). Leyes 5 y 9. Se verifica: a 1024×768 el primer rótulo se ve sin bajar; a 375 px
   `right` del rótulo ≤ ancho de la pantalla. Esfuerzo S. Presentación: OK de Felipe.
2. **El buscador ofrece solo prendas de verdad.** Antes: aparece la «Prenda sin Registrar» (el producto interno `ID_PRODUCTO_CARGO_ESPECIAL`) y no
   se excluyen los productos de prueba. Después: `getRotulos` los saca, como ya hacen Existencias, Caja y Conteo. Ley 9. Se verifica: escribir «prenda»
   no la ofrece; prueba de la lectura. Esfuerzo S. Es un defecto, no una regla de negocio.
3. **El aviso de la Mac en una línea que dice que sí se puede imprimir.** Antes: un párrafo técnico arriba del contenido, que deja la duda de si se
   puede imprimir sin hacerlo. Después: «Puedes imprimir igual; para que salga a la medida exacta, esta Mac necesita un paso único · Ver cómo», y el
   comando con su «Copiar» bajo ese toque. Leyes 4 y 6. Va en `AvisoAyudanteMac`, compartido: **cambia también Etiquetas de precio**. Esfuerzo S.

## Lo que sobra (ley 8)
- «Guía de impresión» en la nota al pie: ya está junto al botón de imprimir. Es la misma convención de Etiquetas de precio; si se quita, en las dos.

## Lo que no pediste y importa más
La prueba de verdad es papel: imprimir un rótulo en la Brother del almacén y pegarlo en el anaquel. Ninguna medición de pantalla dice si «VALERIA» se
lee a 3 metros con la luz del almacén.

## Lista aparte (no se ejecuta)
- «modelo» → «prenda» en el buscador, las píldoras y «Un rótulo por modelo» (evidencia débil, n=1; barato).
- El combo recibe el foco dos veces seguidas con Tab [Medido en el recorrido; el escéptico no lo pudo ver en el código].
- Píldoras de prendas y combo desalineados 2 px.
- El título dice el nombre de la pieza («Rótulos de anaquel»), no la pregunta.
- `/focus` marca campos sin guía; la pantalla está declarada `no-aplica` como Etiquetas de precio (un buscador opcional y copias).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | coincide: «armar un letrero para pegar en un estante» |
| Primer intento | sí, sin retroceder (sobre capturas: no tocó la pantalla viva) |
| Pasos | 5 toques (mínimo 5) |
| Dudas | «Solo por modelo / Todos en un rótulo» · «IMPRIMIR 2 RÓTULOS» (plural) · el aviso del ayudante («¿me toca hacer eso?») · «Copias» |
| Palabras no entendidas | «Terminal», «instalar.sh \| sh», «red local», «ayudante de etiquetas»; «modelo» la leyó como persona |
| Errores evitables | 0 |

Limitación: el ciego trabajó sobre capturas (el panel del navegador estaba oculto), no sobre la pantalla viva; no vio la lista del buscador ni el diálogo de impresión.

## Antes de decir «listo»
- **Concurrencia:** la pantalla no escribe en la base; dos personas imprimiendo a la vez no se pisan. [Medido: `getRotulos` solo lee]
- **Caída externa:** si la base no responde, el loader global y el error de la lectura (`exigir`); si el ayudante de Mac no contesta, imprime por el diálogo de Chrome. [Lectura del código]
- **Persona sin contexto:** ciego sobre capturas: pasa. Colaboradora real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-09 | a93d23eb | 7,1 | 7 | — (propuestos) |
| 2026-10-09 | (este commit) | 8,0 | 8 | 1 el rótulo primero y entero · 2 buscador sin la prenda interna · 3 aviso de Mac en una línea |
