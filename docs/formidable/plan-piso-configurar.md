# Formidable · Gestión ▸ Plan del piso ▸ «Configurar piso» (botón y hoja)   (`/gestion/plan-del-piso`)

- **Fecha / SHA:** 2026-11-14 · rama `claude/prendas-disponibles-piso-cecc5a` (commits `231f44a90`…`00c9eb9d1`) · **Dispositivo que manda:** escritorio (el líder en la oficina o en tienda); 375 px se adapta
- **Pregunta que resuelve:** «el sistema cree que mi riel cabe N prendas y la realidad es otra: ¿cómo lo corrijo?» · **Protagonista:** el número «N prendas caben en el riel»
- **Estado:** ciega ✓ · real sin probar. Los 3 cambios de abajo los aprobó Felipe el 2026-11-14 y están aplicados y vistos en el navegador (ver «Historial»); falta repetir la prueba ciega con ellos.
- **Veredicto:** se encuentra y se completa sin ayuda (ciega: lo dejó listo en unos 8 clics, sin guardar); la única fricción real es el día del conteo bloqueado por «Aún no lo conté».

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciega (Sonnet, sin contexto): vio «Configurar piso» a la primera, completó m², prendas por m² y fecha; dudó solo en la fecha |
| 2 Una pregunta, una respuesta | 8 | [Observado] un número grande («252 prendas caben») que cambia mientras se teclea; un solo botón principal |
| 3 Simplicidad profunda | 8 | [Observado] entendió «+72 · antes 180» y «casi vacío (2 %)» como veredicto; no entendió del todo por qué el % baja |
| 4 Lenguaje de tienda | 8 | [Observado] sin jerga; «provisional» lo explicó el «?» de «Contado el» |
| 5 Contenido primero | 8 | [Medido] la hoja cabe sin scroll a 1440 y a 375 con los botones a la vista (`pie-hoja-fijo`) |
| 6 Lo difícil, a un toque | 9 | [Observado] el porqué del conteo vive en el «?»; nada necesita hover |
| 7 Perdonar antes que preguntar | 8 | [Medido] «Guardar» sin cambios no se apaga: responde «ya estaba así» y no escribe (versión 5, mismas filas); [Observado] «Cancelar» al lado, sin miedo a romper |
| 8 Quitar antes de agregar | 7 | [Observado] «Eres admin. Guardas a tu nombre…» le sobró (es la nota del combo Responsable: pieza del sistema, no de esta hoja) |
| 9 De punta a punta | 8 | [Medido] 375 px sin scroll de lado; [Medido] oscuro 0 hallazgos solo en oscuro; choque de versión y red caída probados (/chaos: 4 de 4 resisten); falta ver el celular real |
| **Leyes (promedio)** | **8,0** | |
| **Oficio visual** | **8** | [Medido] /milimetro: 0 graves; las 2 medias y la leve de la hoja (botón apagado, error suelto, pie sin `pie-acciones`) ya corregidas en `00c9eb9d1`; quedan 2 leves de la pieza del sistema (etiqueta de 11 px en oscuro, interruptor de 22 px) |

## Los 3 cambios de mayor impacto (aprobados y aplicados el 2026-11-14)
1. **Tocar el día del conteo bloqueado apaga «Aún no lo conté».** Antes: el campo sale gris, no deja escribir y no dice por qué; quien lo descubre es porque ve el interruptor. Después: un clic en la fecha bloqueada apaga el interruptor y deja el cursor en la fecha. Ley 1 y 2. Se verifica con la misma prueba ciega: sin dudar en la fecha.
2. **Decir de qué cifra habla la frase de abajo.** Antes: «Tu riel estaría casi vacío (2 % ocupado)» se confunde con el 252 de arriba. Después: la misma frase precedida de «Con lo que cuelga hoy:» (la frase de `fraseDeEstado` no cambia, que es de toda la pantalla). Ley 3 y 4.
3. **Que se vea que el valor anterior no se pierde.** Antes: «+72 · antes 180» no dice si el 180 se borra. Después: un «?» junto al título de la hoja: «Queda anotado quién lo cambió y cuánto era antes». Ley 9 (explicación detrás del «?», regla «poco texto»).

**Descartado a propósito:** precargar la fecha del conteo con hoy o ayer (propuesta de la prueba ciega). Sería poner una fecha de conteo que nadie contó: justo lo que la fecha impide (subir los m² hasta que el aviso desaparezca sin contar). Se queda vacía.
**Lo que sobra (ley 8):** nada propio; la nota «Eres admin…» es del combo Responsable en todo el ERP.
**Lo que no pidió y importa más:** la capacidad real de TRU puede no ser 480; la primera medida real conviene que la tome Felipe antes de que otra persona la guarde (ver ADR-0329, «Actualización 2026-11-14»).

## Historial
- **2026-11-14, tras el OK de Felipe:** (1) un toque en la caja de la fecha apaga «Aún no lo conté» y deja el cursor ahí; teclear un día completo también lo apaga; (2) «Con lo que cuelga hoy:» en texto discreto sobre la frase (primero salió en versalitas negras y pesaba más que la frase: se bajó); (3) «?» junto al título con «Queda anotado quién lo cambió y cuánto era antes.». [Medido/Observado] en el navegador a 1440: interruptor `false`, foco en `#piso-contada-el`, base sin cambios; oscuro 0 hallazgos solo en oscuro; guía de 20 pasos sin escrituras. Sin repetir la prueba ciega.
