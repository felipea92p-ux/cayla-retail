# Formidable · Catálogo ▸ Liquidación   (`/productos/liquidacion`, ADR-0371)

- **Fecha / SHA:** 2026-10-10 · `ec4f1f41f` · **Dispositivo que manda:** escritorio (Mac mini o computador de almacén y caja)
- **Pregunta que debería resolver:** «¿qué prendas sueltas estoy rematando, a cuánto, y cómo etiqueto o le bajo el precio a una?» · **Protagonista:** la prenda y su precio
- **Veredicto en una línea:** se entiende qué es en 5 s, pero la palabra «pieza» y los dos pasos «Etiquetar / Imprimir etiqueta» hacen dudar a quien llega nueva.

Cómo se midió: el panel del navegador de la app estaba oculto y React 19 no revela el contenido en streaming sin cuadros de animación, así
que las medidas y capturas se hicieron con Playwright (el motor de `tema/`, cuenta del seed) a 1440 × 900, 1024 × 768 y 375 × 812. La prueba
ciega fue sobre capturas (agente Sonnet sin repo). Un escéptico (Sonnet) juzgó cada hallazgo contra el código y las capturas.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 | [Observado] ciego: lectura de 5 s correcta, pero 12 dudas y 4 errores probables; «no tengo certeza de que lo logre sin ayuda» · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] una acción principal por vista; [Observado] «Etiquetar» y «Imprimir etiqueta» parecen la misma cosa |
| 3 Simplicidad profunda | 8 | [Observado] categoría + precio y nada más; el veredicto «Rebajada» y el tachado traducen el historial |
| 4 Lenguaje de tienda | 5 | [Observado] «pieza» (¿prenda o etiqueta?), «Rebajada» (¿vendida?), «Etiquetar»; escéptico: CONFIRMADO / MATIZADO |
| 5 Contenido primero | 7 | [Observado] la etiqueta tal como sale y el ícono de la categoría; la fila no dice qué prenda es más allá de la categoría |
| 6 Lo difícil, a un toque | 8 | [Medido] la impresora de la Mac bajo «Ver cómo»; el motivo de un rechazo en el aviso |
| 7 Perdonar antes que preguntar | 7 | [Opinión] se confirma solo lo que mueve precio o retira; sin «deshacer», correcto porque toca dinero |
| 8 Quitar antes de agregar | 6 | [Medido] «Precio» rotulado dos veces en la hoja; nota del pie de 4 líneas (6 a 375 px) que repite la cabecera en parte |
| 9 De punta a punta | 6 | [Medido] a 375 px las tres cifras empujan la lista bajo el pliegue; [Observado] dos prendas de la misma categoría no se distinguen |
| **Leyes (promedio)** | **6,6** | |
| **Oficio visual** | **8** | [Medido] lo de esta pantalla pasa; lo que falla (Salir 37×16, Ctrl K 3,32:1, textos de 10–11 px, atajo «/» 3,60:1) es del marco o del Buscador común — escéptico: REFUTADO para esta pantalla. Bordes de 1–2 px en la fila (312/313, 1082/1084) |

## Los 3 cambios de mayor impacto
1. **Hablar como la tienda.** Antes: «+ Etiquetar una pieza», columna «Pieza», chip «Rebajada», botón «Etiquetar». Después: «+ Etiquetar una
   prenda», «Prenda», «Precio bajado», botón «Crear etiqueta» con la línea «Después la imprimes y la pegas en la prenda». Ley 4 y 1 (H1, H2, H3).
   Se verifica: ciego otra vez, sin dudas en esas palabras. Esfuerzo S. Presentación (OK de Felipe).
2. **Quitar lo repetido.** Antes: «Precio» + «PRECIO DE LIQUIDACIÓN»; nota de 4 líneas. Después: un solo rótulo; la nota dice solo lo que no
   está arriba (venta final, sin descuentos, el mínimo). Ley 8 (H4, H6). Se verifica: medir la hoja y la nota. Esfuerzo S. Presentación.
3. **Las cifras no tapan la lista.** Antes: a 375 px tres tarjetas apiladas hasta ~640 px; «Rebajadas» parece tocable y no hace nada. Después:
   cifras compactas en una fila bajo `sm`, y «Precio bajado» filtra (como las otras dos). Ley 9 y 2 (H5, H8). Esfuerzo M. Presentación.

## Lo que sobra (ley 8)
- El título «Precio» del bloque y el rótulo del campo dicen lo mismo: queda uno.
- En la nota, «para bajarle el precio, ábrela…» repite la cabecera: se quita.

## Lo que no pediste y importa más
**Reconocer la prenda.** Con dos «Camisas y Blusas» a la venta, la lista solo las separa por código y precio; quien busca «la blusa beige» no
la encuentra (H7, CONFIRMADO). Una descripción corta y opcional al etiquetar («blusa beige, manga larga»), buscable y en la etiqueta, lo
resolvería, pero cambia tu decisión de «solo categoría y precio»: es tuya.

## Lista aparte (no se ejecuta)
- El atajo «/» del Buscador común a 3,60:1 (sistema, no esta pantalla).
- Bordes que difieren 1–2 px entre la fila de la lista y el encabezado.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | coincide: «lista de prendas en remate, cada una con su etiqueta y su precio que se va bajando» |
| Primer intento | no del todo: segura al crear, insegura al imprimir y al bajar el precio |
| Pasos | 9 (mínimo 7) |
| Dudas | 12 — «pieza», «Etiquetar» / «Imprimir etiqueta», «Rebajada», «Retirar», «Sigue aquí», «Eres admin» (marco) |
| Palabras no entendidas | «pieza», «Rebajada», «Retirar», «Etiquetar», «no entra al catálogo ni al stock» |
| Errores probables | 4: no hay dónde escribir «blusa vieja»; crear una nueva en vez de bajar la existente; no imprimir la nueva; creer que «Etiquetar» ya imprimió |

## Antes de decir «listo»
- Concurrencia: `/chaos` semilla 371 — dos cajas, rebaja contra venta, retiro contra venta y el mismo token a la vez: resiste (`docs/chaos/README.md`).
- Caída externa: sin red al etiquetar, «No se guardó nada» y la hoja conserva lo escrito; sin red en Vender, la pieza no se encola.
- Persona sin contexto: ciega sobre capturas, sí; colaboradora real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `ec4f1f41f` | 6,6 · ley 1: 5 | 8 | — (propuestos) |
| 2026-10-10 (b) | `ffd644a3e` | 7,7 · ley 1: 7 | 8 | los 3 + «Para reconocerla» + la ✕ de «Lista para imprimir» |

## Recalificación 2026-10-10 (b) — después de los 3 cambios
Hechos (OK de Felipe): «prenda» en toda la pantalla, «Precio bajado», «Crear etiqueta» + «Después la imprimes y la pegas en la prenda»; un
solo rótulo de precio y nota de una línea; las tres cifras filtran y en celular van en una fila (la lista sube de ~880 a **576 px** a 375 ×
812, **Medido**); «Para reconocerla» opcional, con ejemplo que sigue a la categoría (**Medido**: con «Camisas y Blusas», «Blusa beige, manga
globo»). La 2.ª prueba ciega (**Observado**) ya no dudó de «pieza» ni de «Etiquetar / Imprimir», y usó «Para reconocerla» sin que se lo
dijeran; su error «duplicaría la blusa de 30» venía de los datos de prueba (la captura ya traía esa blusa creada). Pidió una ✕ en «Lista
para imprimir»: hecha. Notas: 1 → 7 · 2 → 8 · 4 → 7 · 8 → 8 · 9 → 8; el resto igual. **Leyes 7,7 · oficio 8.** Colaboradora real: sin probar.
