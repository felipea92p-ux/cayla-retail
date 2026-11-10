# Formidable · Catálogo ▸ «Nuevo color» en Estampado y la foto del estampado (ADR-0634)

- **Fecha / SHA:** 2026-11-09 · e7ec05933   · **Dispositivo que manda:** escritorio (Mac mini); 375 px en Vender
- **Pregunta que debería resolver (1 frase):** ¿qué estampado llegó, y cómo lo reconozco después entre los otros de la misma prenda?   · **Protagonista:** la prenda
- **Veredicto en una línea (después de los cambios):** se completa sin retroceder ni clics perdidos; falta probarla con una colaboradora real. Las notas de abajo son las de antes: las de ahora van en «Después de los 3 cambios».

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: terminó, 0 retrocesos, 11 toques; dudó en «LISO / ESTAMPADO» y en dónde seguir · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] 1 acción primaria a 1440, 1024 y 375 px |
| 3 Simplicidad profunda | 7 | [Medido] tono y familia salen solos; [Opinión] «plan del piso» muestra una regla interna |
| 4 Lenguaje de tienda | 6 | [Observado] no entendió «Plan del piso», «SKU»; [Medido] «3 LETRA» cortado |
| 5 Contenido primero | 8 | [Medido] la foto toma el lugar del punto en 4 pantallas; 22 px en la tarjeta |
| 6 Lo difícil, a un toque | 6 | [Medido] la regla de la familia es texto fijo, sin «¿Por qué?» |
| 7 Perdonar antes que preguntar | 8 | [Medido] crear es reversible, sin «¿Seguro?» innecesario |
| 8 Quitar antes de agregar | 7 | [Medido] oculta tono y familia; hasta tres avisos de lo mismo |
| 9 De punta a punta | 6 | [Medido] errores cuidados; el combo de patrón desaparece sin decirlo |
| **Leyes (promedio)** | **7,0** | ninguna ley bajo 6 |
| **Oficio visual** | **8** | [Medido] 1440 y 1024 px: 0 controles chicos, 0 contraste, 0 desborde, 1 primaria; 375 px: el segmento mide 32,5 px, bajo 44 (`tacto.css` no lo incluye) |

## Los 3 cambios de mayor impacto
1. **La hoja habla en palabras de tienda.** Leyes 1 y 4. Presentación. Esfuerzo S.
   - Antes: «LISO / ESTAMPADO» sin título (la `etiqueta` solo la lee el lector de pantalla) · «Cuenta como Rojo en los filtros y en el plan del piso. Súbele su foto: es como se va a reconocer» · «Faltan: Patrón», que es opcional.
   - Después: título visible «¿Es de un solo color o tiene dibujo?» · «Se agrupa con los rojos. La foto la subes en la lista de colores.» · el patrón va como «opcional» y no entra en «Faltan».
   - Se verifica: repetir la ciega; `guia` con patrón vacío dice que falta solo color y nombre.
2. **«Agregar color» no estorba ni esconde cómo seguir.** Leyes 1 y 9. Presentación. Esfuerzo S.
   - Antes: la lista del buscador se abre sola encima de la carta y de «+ Nuevo color» (el primer clic solo la cierra, o elige otro color sin querer); el botón «Agregar N variantes» queda al fondo de una hoja larga.
   - Después: la hoja abre con la carta a la vista (`focoEnLaHoja`) y el pie queda fijo (`pie-hoja-fijo`).
   - Se verifica: abrir la hoja a 1440 y 768 px de alto: ninguna lista abierta, botón visible. Es defecto anterior a esta rama, y toca el flujo de re-stock.
3. **Sin foto, dos estampados no son dos puntos iguales.** Ley 1 y la razón de todo el cambio. Presentación. Esfuerzo S.
   - Antes: sin foto que distinga, el punto es solo el color dominante; el nombre va en `title`, que en el celular no existe.
   - Después: el punto lleva la inicial del estampado («F», «R») sobre su color.
   - Se verifica: prenda con dos estampados sin foto, a 1440 y 375 px.

## Lo que sobra (ley 8)
- Con todo vacío, el error bajo cada campo y la fila «Faltan:» dicen lo mismo; al sacar el patrón de la lista baja a dos.

## Lo que no pediste y importa más
Hoy nadie obliga a subir la foto, y sin ella el estampado se reconoce mucho peor. Pedirla como obligatoria al recibir puede trabar una recepción: lo decide Felipe.

## Lista aparte (no se ejecuta)
- El segmento Liso/Estampado no entra en `tacto.css`: 32,5 px con el dedo (pieza del sistema, afecta a todas las hojas).
- Si los patrones no se pueden leer, el combo desaparece sin decirlo (el nombre se escribe a mano).
- Si dos personas crean el mismo estampado a la vez, el segundo lee «Ya existe un color muy parecido… mayúsculas, tildes», sin «Elegir ese».
- «3 LETRA» se corta en la caja del código; «Va en el SKU» no se entiende.
- En Ajustar stock y Recibir, la fila con foto es más alta que sus vecinas (no medido).

## Veredictos del escéptico
Confirmados: tarjeta sin foto (A), frase de la foto (D), «plan del piso» (E), combo que desaparece (H), botón al fondo (J), segmento sin título (K). Matizados: patrón en «Faltan» (C: es mensaje, no lógica), 44 px (F: solo el segmento; las cajas sí entran en `tacto.css`), lista abierta (I: anterior a esta rama; [Observado] tres veces en el navegador). No verificables por lectura: triple aviso (B), alto de fila (G), «3 LETRA» (L), «Variantes» (M).

## Prueba ciega
Sonnet, navegador local, datos inventados. Tarea: registrar un diseño a cuadros casi todo rojo en una blusa.

| Medida | Resultado |
|---|---|
| Lectura de 5 s | Coincide: ficha de la prenda y «aquí se inventa el color» |
| Primer intento | Sí, 0 retrocesos |
| Pasos | 11 toques y 1 escritura (dos fueron clics que la lista abierta se comió) |
| Dudas | «LISO / ESTAMPADO» · «El color que más se ve» · dónde seguir tras «Crear y elegir» · «Unidades de partida» |
| Palabras no entendidas | «Plan del piso» · «SKU» · «Súbele su foto» (dónde) · «Familia» |
| Errores evitables | 1 (clic en «+ Nuevo color» que solo cerró la lista) |

## Después de los 3 cambios (OK de Felipe, 2026-11-09, `361d36d1b`)

| Eje | Antes | Después | Por qué |
|---|---|---|---|
| 1 Sin manual | 7 | 8 | [Observado] ciega repetida (otro diseño): 10 toques, 0 retrocesos, ningún clic perdido; «dudé muy poco» en Liso/Estampado. Es el tope sin colaboradora real |
| 3 Simplicidad profunda | 7 | 8 | [Medido] «Se agrupa con los azules» en vez de la regla interna |
| 4 Lenguaje de tienda | 6 | 7 | [Observado] entendió «Se agrupa con los verdes» y dónde va la foto; quedan «SKU» y «Variantes» |
| 8 Quitar antes de agregar | 7 | 8 | [Medido] el patrón ya no cuenta como lo que falta |
| 9 De punta a punta | 6 | 7 | [Medido] 0 listas abiertas al entrar; botón en 675–715 de 768 px de alto; el pie llega al borde (743 de 744) |
| Las demás (2, 5, 6, 7) | 8 · 8 · 6 · 8 | iguales | |
| **Leyes** | **7,0** | **7,5** | ninguna bajo 6 |
| **Oficio** | **8** | **8** | [Medido] a 1280 px sin controles chicos ni desborde; a 375 px el segmento sigue en 33 px |

Arreglado de paso, con el cambio 2: el pie fijo de toda hoja de vidrio quedaba 4 px corto (`vidrio/hoja.css`: la hoja tiene 1,75 rem de relleno y el pie asumía 1,5).

Prueba ciega repetida: 5 s correctos en la ficha y en la hoja · 10 toques · 0 retrocesos · 0 errores evitables · dudas: «Los colores que llegaron», «+ Nuevo color», cuál de los verdes, «Agregar 3 variantes». Esperaba que «Crear y elegir» terminara el trabajo: todavía falta «Agregar 3 variantes».

Nuevo en la lista aparte: «Crear y elegir» no termina el trabajo; «Los colores que llegaron» se puede leer como «los que ya están»; en Vender, un estampado que cae en el «+2» no muestra su inicial hasta abrir la hoja.

No medido en esta pasada: el modo oscuro en pantalla, y la inicial a 375 px (usa la misma clase que el punto medido antes).

## Antes de decir «listo»
- Concurrencia: dos personas con el mismo nombre: la base rechaza la segunda y lo dice; el texto no calza con un nombre automático (lista aparte). · Caída externa: «No se pudo hablar con el servidor», lo escrito se conserva. · Persona sin contexto: ciega pasa; real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-09 | e7ec05933 | 7,0 | 8 | — |
| 2026-11-09 | 361d36d1b | 7,5 | 8 | Los 3 (título visible y patrón opcional; lista cerrada y pie a la vista; inicial en el punto) |
