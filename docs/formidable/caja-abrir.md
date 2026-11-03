# Formidable · Ventas ▸ Caja ▸ Abrir caja (caja cerrada)   (/caja)

- **Fecha / SHA:** 2026-11-03 · 1daa00028 · **Dispositivo que manda:** escritorio (Caja es de escritorio; el celular se adapta)
- **Pregunta que debería resolver:** «¿Cuánto hay en el cajón y quién abre?» · **Protagonista:** el dinero del cajón
- **Veredicto en una línea:** «Se entiende en 5 s y las tres pasadas abrieron la caja sin retroceder; le falta decir siempre qué falta y proteger el monto.»
- **Evidencia:** [Medido] medir-oficio a 1440, 1024 y 375 · [Observado] 1 agente ciego, 3 pasadas (modelo simulando a la encargada: **real: sin probar**) · [Observado] ataque de `/chaos` con base simulada (`.chaos/`, fuera de git).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciego: las 3 pasadas abrieron en 3–5 toques; dudó con el botón gris y con «Responsable» |
| 2 Una pregunta, una respuesta | 8 | [Observado] el campo grande del total manda; el chip «Igual al cierre» no parecía botón |
| 3 Simplicidad profunda | 8 | [Observado] «Cuadra / Faltan S/ 8.50» se lee de un vistazo |
| 4 Lenguaje de tienda | 8 | [Observado] «para el líder» no se entendió si el líder era ella; «Primera apertura» sin explicar |
| 5 Contenido primero | 7 | [Observado] Ayer/Meta/Cierras y los 7 cierres «sin uso aparente» |
| 6 Lo difícil, a un toque | 6 | [Observado] no dice qué pasa con la diferencia; quedó la duda «¿me descuentan?» |
| 7 Perdonar antes que preguntar | 6 | [Observado/chaos] sin tope: S/ 100000 por error de dedo sale sin confirmar |
| 8 Quitar antes de agregar | 6 | [Medido] el resumen repite «Debería haber» y «Cerró» que ya están a la izquierda |
| 9 De punta a punta | 6 | [Observado] «Falta:» nombra una sola cosa y se apaga con el responsable sin elegir; en celular el botón queda bajo el pliegue y «Caja abierta» sale fuera de vista; rechazo de la base en texto crudo |
| **Leyes (promedio)** | **7,0** | |
| **Oficio visual** | **7** | [Medido] 5 de 8 fallan a 1440: casi todo es del sistema (versalitas de 11 px, radios); lo propio: «Contar billetes y monedas» mide 20 px de alto (mínimo 24) |

## Los 3 cambios de mayor impacto
1. **El monto no se adivina ni se escribe sin cuidado.** Antes: pegar «Total: 3,50 (2 monedas)» abre con S/ 3,502; «-5» abre con 5; 40 nueves viajan a la base. Después: no se filtra lo que se escribe; lo que no se entiende dice «No se entiende el monto: escribe solo el número, como 258.50» y el botón queda apagado; y un tope de cordura. **Ley 7 y 9.** Verifica: prueba de las reglas + repetir el ataque con el mismo pegado. Esfuerzo S. **Dinero: el OK y el tope (¿S/ 20,000? ¿pide confirmar?) son de Felipe.**
2. **La pantalla dice siempre qué falta, y en el celular se llega al botón.** Antes: «Falta: qué pasó…» nombra una cosa y desaparece aunque falte el responsable; en 375 px el botón está al fondo y «Caja abierta» sale fuera de vista. Después: «Falta: el monto y el responsable» completo y siempre; la barra de abajo del celular con «Abrir caja» (La Isla); al abrir se sube al inicio; un solo clic abre una vez (seguro propio). **Ley 9 y 1.** Verifica: ciego a 375 px + repetir ataques 4 y 5. Esfuerzo M. Presentación.
3. **Quitar lo repetido y explicar lo difícil.** Antes: el resumen repite lo de la izquierda; la diferencia no dice qué pasa. Después: el resumen deja de repetir «Debería haber» y «Cerró»; bajo «¿Qué pasó?» una línea «El líder de equipo lo verá en Inicio»; «Contar billetes y monedas» sube a 32 px. **Ley 8, 6 y oficio.** Verifica: medir-oficio (blancos) + ciego. Esfuerzo S. Presentación.

**Lo que sobra (ley 8):** «Hora» del resumen y, si Felipe quiere, Ayer/Meta/Cierras. **Lo que Felipe no pidió y importa más:** el tope de cordura del monto (dinero).

## Lista aparte (no se ejecuta sin OK)
Foco con teclado tras elegir responsable y tras Esc en la hoja de contar · traducir «ya_hay_caja_abierta» («Ya hay una caja abierta: actualiza la pantalla») · tope de largo del motivo · la hoja de contar recuerda lo contado y no acepta «3.7» como 37 · el total no se edita durante «Abriendo…».

## Veredicto del escéptico
No se lanzó un cuarto agente (la escala acordada fue 2). Cada hallazgo se contrastó con el código: **CONFIRMADOS** el «Falta:» incompleto (`!listo` mira solo el monto), el resumen repetido, el botón fuera de vista y el pegado que cambia el monto (llamada real `p_monto_apertura:3502`). **MATIZADO**: «Igual al cierre» no parece botón (es el botón secundario del sistema). **NO VERIFICABLE**: la duda sobre «Responsable» (es el combo del sistema) y todo lo de «real: sin probar».

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-03 | 1daa00028 | 7,0 | 7 | — (primera corrida) |
