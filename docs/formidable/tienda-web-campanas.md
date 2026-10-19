# Formidable · Tienda web ▸ Campañas   (`/tienda-web/campanas`, `/tienda-web/campanas/[id]` y sus hojas)

- **Fecha / SHA:** 2026-10-17 · 191b69bca (rama `claude/campanas-design-customization-ddbd90`) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿Cómo se ve esta campaña en la portada de la tienda online, y cómo la dejo lista para los clientes?»
  · **Protagonista:** la portada (lo que verá el cliente)
- **Veredicto en una línea:** «Se entiende y se termina sin ayuda (21 órdenes), pero después de publicar dice "Falta" en pasos ya hechos, cuenta
  mal las prendas que salen y "las prendas" significa dos cosas distintas en la misma pantalla.»
- **Escala:** un agente (el ciego, Sonnet); medidor y escéptico hechos por el revisor, sin más agentes.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciego: terminó la tarea (huellitas, dos prendas, publicada) en 21 órdenes, con 9 dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] una sola acción primaria a la vista (`accionesPrimarias: 1`) · [Observado] la vista previa es lo primero que se mira |
| 3 Simplicidad profunda | 8 | [Medido] la revisión traduce el contraste a «La letra se lee bien» / «oscurece la foto un poco más» |
| 4 Lenguaje de tienda | 6 | [Observado] dudas con «Polaroids», «Sello», «modelos», «variante» y dos «prendas» (pestaña y paso) |
| 5 Contenido primero | 9 | [Observado] la portada en grande manda; los pasos la acompañan |
| 6 Lo difícil, a un toque | 7 | [Opinión] el porqué de «no se lee» está en la revisión, a la vista cuando hace falta |
| 7 Perdonar antes que preguntar | 7 | [Medido] «Deshacer», «Volver al anterior»; publicar confirma con hoja (es reversible: [Opinión] podría no pedirla, pero la hoja muestra los dos tamaños, y Felipe la aprobó en la maqueta) |
| 8 Quitar antes de agregar | 7 | [Opinión] ocho estilos y cuatro acomodos con su portada en chico pesan, pero son el contenido de la decisión |
| 9 De punta a punta | 5 | [Observado] «Falta» tras publicar · [Medido] «4 elegidas por ti» con 3 que salen · «vuelve a el diseño anterior» |
| **Leyes (promedio)** | **7,0** | ley 9 en 5: la pantalla buena falla en sus bordes |
| **Oficio visual** | 7 | [Medido] lo que falla es de piezas del sistema (interruptor 38×22, «Deshacer» 20 px de alto, «Ver en la web» 14 px, la pestaña activa que el medidor ve sin su píldora) y de la portada en chico (letra diminuta a propósito); nada propio de estas pantallas |

## Los 3 cambios de mayor impacto
1. **«Falta» solo donde de verdad falta.** Antes: al abrir una campaña con diseño (y otra vez al publicar), los pasos no visitados dicen «Falta» y
   «Sigue aquí»; el ciego dudó si podía publicar y, ya publicado, si se había guardado. Después: un diseño que ya existe (borrador o publicado) abre
   con sus pasos «por revisar» y sin «Sigue aquí»; la guía «Falta / Sigue aquí» queda para una campaña que todavía tiene el diseño de siempre (la
   regla de ADR-0284: «una ficha que ya venía completa no se llena de marcas»). Ley 1 y 9. Se verifica: abrir el Gato y publicar → sin «Falta».
   Esfuerzo S. Decide Felipe (presentación).
2. **«Las prendas» del diseño se llama por lo que es y cuenta lo que sale.** Antes: el paso «6. Las prendas · 4 elegidas por ti» mostraba 3 marcadas
   («Toca hasta 3»), y se confundía con la pestaña «Prendas» (las que llevan el descuento). Después: «6. Qué prendas salen en la portada», con el
   resumen de las que salen («3 elegidas por ti»; si se eligieron más de las que caben, «3 de tus 4 elegidas»). Ley 4 y 9. Se verifica en
   `campana-diseno.test.ts` y en el navegador. Esfuerzo S. Decide Felipe (nombre del paso).
3. **Los textos de las hojas, bien escritos.** «La portada … vuelve a el diseño anterior» → «vuelve al diseño anterior». Ley 4. Esfuerzo S.

## Lo que sobra (ley 8)
Nada que quitar: las portadas en chico de estilos y acomodos son lo que se elige.

## Lo que no pediste y importa más
Las fechas de una campaña aceptan el año 0001 o el 9999 sin avisar (lo halló `/chaos`): esas fechas deciden cuándo la caja cobra el descuento.

## Lista aparte (no se ejecuta)
- «Polaroids», «Sello», «modelos», «variante» sin explicación (ley 4): la maqueta los nombra así; se puede sumar una nota corta bajo cada opción.
- «Ver en la web» abre otra pestaña sin decirlo.
- Piezas del sistema bajo el objetivo de 32 px (interruptor, «Deshacer», «Ver en la web»): son de `/unificar`, no de esta pantalla.

## Escéptico (lo hizo el revisor)
- REFUTADO: «tocar una prenda abrió "2. Colores"» y «el botón de la hoja estaba tapado»: la herramienta del ciego no borraba los números de la
  lista anterior y tocó otro elemento (corregido para la próxima prueba).
- REFUTADO: «las tarjetas de estilo tienen todas el mismo nombre»: la portada en chico va con `aria-hidden`; el nombre de cada tarjeta es el suyo.
  La herramienta leía el texto visible, no el del lector.
- CONFIRMADOS: «Falta» tras publicar (el editor se rearma y olvida lo visitado), «4 elegidas» con 3 que salen (`resumenPrendas` no corta por lo que
  cabe), dos «prendas» distintas, «vuelve a el».

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | coincide: «Campañas de la tienda web: cuál sale en la portada cada día; abro la del Gato» |
| Primer intento | sí, terminó (con dos tropiezos de la herramienta) |
| Pasos | 21 órdenes (mínimo ≈ 9) |
| Dudas | «Editar diseño» o «Datos y prendas» · «Falta:» · «4 elegidas por ti» · «Publicar diseño» dos veces · «PRENDAS 5 MODELOS» o «6. Las prendas» · «VER EN LA WEB» |
| Palabras no entendidas | Polaroids, Sorpréndeme, Sello, Caramelo, «2 en carrusel», «Diseño de siempre», «Lo nuevo», modelos, variante |
| Errores evitables | 0 propios de la pantalla (los 3 contados fueron de la herramienta) |

## Antes de decir «listo»
- Concurrencia: dos pestañas sobre el mismo diseño → la segunda dice «Alguien más cambió» y no pisa nada (`/chaos` NAV-05).
- Caída externa: sin red, el borrador avisa y reintenta; en las hojas, el aviso de corte y la pantalla rehecha (`/chaos` RS-01, RS-03).
- Persona sin contexto: la prueba ciega lo respondió (terminó sola); real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-17 | 191b69bca | 7,0 | 7 | — (los 3 esperaban el OK de Felipe) |
| 2026-10-17 (después) | 2c40e50d6 | sin recalificar | sin recalificar | los 3 cerrados con el OK de Felipe, cada uno con su prueba y verificado en el navegador: sin «Falta» falso en un diseño ya armado, «Qué prendas salen» contado por lo que sale, «vuelve al diseño anterior» |
