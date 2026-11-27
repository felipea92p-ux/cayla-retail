# Formidable · Inventario ▸ Existencias sin ruido   (`/inventario`, ADR-0709)

- **Fecha / SHA:** 2026-11-26 · rama `claude/revisar-utilidad-elementos-68e976` (PR #2041)   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** ¿qué hay colgado y guardado en mi tienda, y qué me toca hacer con el piso?   · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se entiende en 5 s y el piso se dice una sola vez; le quedan palabras de oficina (barrido, cuadre, CSV, en pausa) y,
  sin barrido abierto, dos puertas al mismo barrido.»

Cómo se probó: el ERP local contra una pila Supabase propia (`cayla-sin-ruido`, todas las migraciones y el seed), con dos sedes: Trujillo con un
barrido abierto (7 prendas escaneadas) y Lima sin barrido ni cuadre. Medido con `medir-oficio.js` a 1440, 1024 y 375 px y con los siete medidores de
`/milimetro` (informe: `docs/milimetro/auditorias/2026-11-26-existencias-sin-ruido.md`); `pnpm focus` y `pnpm sugerir` sin pendientes. Un agente
ciego (Sonnet) recorrió tres capturas sin el repo. Sin escéptico aparte: cada hallazgo se contrastó con el código y el navegador en la sesión.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciego: a los 5 s leyó «cuántas prendas hay en el piso y cuántas en el almacén» y que alguien está contando; resolvió las 3 tareas por el camino correcto (Sumarme · Hacer el barrido · Descargar CSV y Sonido), 14 pasos, 0 errores · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] con barrido abierto: un aviso y una puerta. [Observado] sin barrido: «Barrido del piso» (cabecera) y «Hacer el barrido» (franja) — «¿son lo mismo?» |
| 3 Simplicidad profunda | 8 | [Observado] «1 según el sistema»: el ciego «no se fía» de la cifra, que es justo lo que debe pasar sin cuadre |
| 4 Lenguaje de tienda | 6 | [Observado] 9 palabras no entendidas: barrido, cuadrar/cuadre, «↑ 5», «+3», «según el sistema», CSV, «al confirmar», «en pausa», «Qué hacer» |
| 5 Contenido primero | 8 | [Medido] la primera fila de prendas empieza en y ≈ 475 px a 1440 × 900, con barrido y sin él (antes del PR no se veía ninguna a 680 px de alto) |
| 6 Lo difícil, a un toque | 6 | [Medido] por qué la cifra dice «según el sistema» y cuántas caben vive solo en el `title` de la cifra (al pasar el mouse); el «?» de la cabecera lo dice en general |
| 7 Perdonar antes que preguntar | 8 | [Medido] nada de lo que cambió guarda; los atajos y filtros se quitan con un toque |
| 8 Quitar antes de agregar | 9 | [Medido] se fueron 7 piezas (fila Gestión, Por colgar en pausa, Se acaban, Sin ventas, el anillo, Pendientes, la franja con barrido abierto) |
| 9 De punta a punta | 8 | [Medido] 375 px sin desborde; sin ícono «Avisos» con barrido abierto (0) y con él sin barrido (1); la guía, 35/35 pasos en escritorio y 33/33 a 375 |
| **Leyes (promedio)** | **7,6** | |
| **Oficio visual** | **7** | [Medido] 0 textos con poco contraste, 0 letras chicas, 0 desbordes; 6–10 blancos bajo 24 px (los puntos de color de la Vitrina, pieza de antes); 23–34 bordes casi alineados |

## Arreglado en esta pasada (sin esperar: era lo grave o lo que rompía la cabecera)
1. «Ver el valor a costo», abierto, ya no empuja la cabecera: se dibuja a lo ancho bajo ella (el título se quedaba en y = 284; ahora 128).
2. «Por colgar» ya no aparece un instante mientras se calcula el plan.
3. El pie de la lista: 16 px entre renglones y «Sonido al confirmar» con su área de 44 px con el dedo.

## Los 3 cambios de mayor impacto (esperan el OK de Felipe; no se tocó nada)
1. **Sin barrido abierto, una sola puerta** (leyes 2 y 8). Antes → después: la cabecera dice «Barrido del piso» y la franja «Hacer el barrido» → mientras la
   franja esté a la vista, la cabecera no lleva el botón (como ya pasa con un barrido abierto); con el piso cuadrado, el botón vuelve. Se verifica con la misma
   prueba ciega: la duda «¿son lo mismo?» desaparece. Ojo: ADR-0709 (decisión 2) conservó el botón sin barrido a propósito; decidir lo contrario lo cambia.
2. **«Sonido al confirmar: Sí» como interruptor** (leyes 1 y 9). El ciego «no sabe si “SÍ” es un interruptor que puedo tocar o solo un texto». Antes → después:
   la píldora con «Sí/No» escrito → `<Interruptor>` con su nombre (la pieza decidida de `casilla`). Va por `/unificar migrar casilla`. Se verifica: el ciego lo toca sin dudar.
3. **El porqué de «según el sistema», a un toque** (ley 6). Antes → después: la explicación (cuántas caben, por qué falta el cuadre) vive solo al pasar el mouse
   → un «?» junto a la cifra que la abre con un toque, también en tablet. Se verifica con el dedo (`pointer: coarse`) y en la prueba ciega.

**Lo que sobra (ley 8):** nada más en la cabecera. **Lo que Felipe no pidió y importa más:** la tabla dice «3 tallas en pausa» en la columna «Qué hacer» y el
ciego no supo si era bueno o malo; con el piso sin cuadrar, toda la columna dice lo mismo y no ayuda a decidir.

## Lista aparte (sin ejecutar)
- «↑ 5» y «+3» en las tallas de la tarjeta: el ciego los dedujo, no los leyó (la leyenda está al pie, lejos).
- «Descargar CSV» → «Descargar Excel» (la palabra CSV no la entendió).
- «Sumarme»: el ciego temió «empezar uno mío y duplicar el trabajo».

## Antes de decir «listo»
- **Concurrencia:** sin escrituras nuevas en este PR. Dos personas en el mismo barrido ya lo resuelve ADR-0690 (lecturas por persona).
- **Caída externa:** si la lectura del barrido falla, la página no dice nada del barrido y el botón sigue (`relleno-a-proposito` en `page.tsx`); si el plan
  del piso falla, la franja se sostiene con la capacidad que llega con la lista.
- **Persona sin contexto:** ciega ✓ (Sonnet, capturas) · real sin probar.
