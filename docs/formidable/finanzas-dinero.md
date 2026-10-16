# Formidable · Finanzas ▸ Cuentas y dinero (camino A) y la hoja «Registrar movimiento»   (`/finanzas/dinero`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver:** «¿Dónde está mi plata, me alcanza y qué debo?» y, con el PR, «anotar que se pagó la planilla o SUNAT» · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende en 5 s ("la que me dice cuánta plata tiene la empresa") y le falta que "Registrar movimiento" diga que
  también sirve para pagar la planilla: la ciega se fue a Gastos.»

Cómo se midió: como en `finanzas-resumen.md` (medición por Playwright a 3 anchos; ciega con un agente sobre capturas; colaboradora real sin probar).
La hoja «Registrar movimiento» además pasó por `/chaos` (ver `.chaos/informes/finanzas-registrar-movimiento-2026-10-16.md`, fuera de git).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 | [Observado] 5 s ✓; pero la segunda parte de la tarea (anotar la planilla pagada desde el banco) **no la completó**: leyó «Movimientos entre cuentas … No son ventas ni gastos: la plata cambia de lugar» y concluyó que «+ REGISTRAR MOVIMIENTO» no sirve («los sueldos son plata que sale»); iría a «Gastos». Es justo lo que el PR agrega (pago de planilla y pago a SUNAT) y la pantalla no lo anuncia. Real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Medido] 1 primario («Registrar movimiento») ✓; [Observado] dos selectores de tienda («VER Tienda Lima» y «TIENDA LIMA») |
| 3 Simplicidad profunda | 6 | [Observado] «tienes S/ 50 310» mezcla bancos de la empresa con el efectivo de una tienda (la franja de abajo lo aclara, el número no); «Baja del mínimo» junto a «173 días de caja» («lo primero suena malo y lo segundo a que sobra plata para meses»); «S/ 50 000» en un banco «sin movimientos todavía» cuando arriba dice que un saldo nunca se escribe a mano |
| 4 Lenguaje de tienda | 6 | [Observado] 10 palabras: «conciliar», «CUENTA 104/101», «días de caja», «flujo», «Cajón», «fondo fijo», «Efectivo por rendir», «cierre», «abonar», «cobros asignados» |
| 5 Contenido primero | 8 | [Medido] la cifra es lo más grande (84 px, 33 616 px²) |
| 6 Lo difícil, a un toque | 6 | [Código] «tienes» no tiene «¿Por qué?» (Resumen y Reportes sí): de dónde sale el total vive en la lista de abajo; «Ver el flujo semana a semana» lleva a otra pantalla |
| 7 Perdonar antes que preguntar | 7 | [Código] la hoja confirma al registrar y anular pide motivo; [Observado] «Solo se agregan filas; un error se anula con motivo» le dio miedo a equivocarse |
| 8 Quitar antes de agregar | 6 | [Observado] 11 dudas; «sin conciliar» y «Sin cobros asignados todavía» en la tarjeta del banco no ayudan a decidir |
| 9 De punta a punta | 7 | [Medido] 375 sin desborde; vacío «Sin movimientos todavía…» ✓; [chaos] el error de un dato («Escribe el monto.») sale como aviso arriba a la derecha, no bajo su campo (regla de `<Aviso>`; el kit de Finanzas queda aparte, ADR-0195) |
| **Leyes (promedio)** | **6,3** | ley 1 en 5 |
| **Oficio visual** | **4** | [Medido] fallan 5 de 8 propias: dos enlaces sueltos de 20 px («Ver el flujo semana a semana», «Ver todo lo que debes»), bordes a 1–2 px (pestaña «Cuentas» vs «¿Me alcanza?»), 1 fila desigual, 7 radios distintos, rojo en 4 piezas, 2 sombras en superficies planas. Pasan: contraste (el 1,06:1 de la pestaña es falso positivo del medidor: la píldora deslizante; `tema:auditar` dio 0), texto mínimo, espaciado |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **La hoja y la lista dicen que también se paga desde aquí.** Antes → subtítulo «La plata cambia de lugar: no es venta ni gasto» y lista «Movimientos entre cuentas … la plata cambia de lugar». Después → «La plata cambia de lugar o sale del banco a pagar la planilla o a SUNAT: no es venta ni gasto», y la lista se llama «Movimientos de plata». Ley 1 · verif.: la ciega repetida elige «Registrar movimiento» para la planilla · esfuerzo S · decide Felipe (texto).
2. **«tienes» dice de quién es cada parte.** Antes → «En los bancos S/ 50 000 · en efectivo S/ 310». Después → «Bancos de CAYLA S/ 50 000 · efectivo de Tienda Lima S/ 310» (la franja de abajo ya lo dice; sube a la frase). Ley 3 · verif.: desaparece la duda «¿es de toda la empresa?» · esfuerzo S · decide Felipe.
3. **«¿Me alcanza?» con una sola lectura.** Antes → chips «Baja del mínimo» y «173 días de caja» juntos. Después → solo la semana que baja y cuánto; «días de caja» pasa a la frase de «¿Por qué?» o se va. Ley 3 · verif.: la ciega no reporta la contradicción · esfuerzo S · decide Felipe.

## Lo que sobra (ley 8)
- «sin conciliar» y «Sin cobros asignados todavía» en la tarjeta del banco (Cuentas): son estados de otra pestaña; una insignia basta.
- «CUENTA 104 / 101» en los títulos de grupo: numeración contable a la vista.

## Lo que no pediste y importa más
Un pago de planilla o a SUNAT registrado mirando una tienda bajaba el saldo del banco y **no aparecía en ninguna lista**: `fn_movimientos_dinero`
filtra por sede y los dos tipos nuevos son de la empresa (`ubicacion_id` nulo). Arreglado en la web en esta rama (tras registrar, la pantalla pasa a
CAYLA entera y el aviso lo dice); la RPC para que el líder vea lo de la empresa en cualquier vista es de Felipe (ver el informe de `/chaos`).

## Lista aparte (no se ejecuta)
- El error de un dato bajo su campo (hoy aviso arriba a la derecha) y la guía de foco de la hoja (`pendiente` desde antes de la regla, 20 controles).
- «Solo se agregan filas; un error se anula con motivo» asusta: «Si te equivocas, se anula con motivo y queda en la historia».
- «Ver el flujo semana a semana» y «Ver todo lo que debes» como `<EnlaceVer>` de 32 px (ADR-0358).
- Dos pestañas con «Clasificar/Conciliación» numeradas y la bandeja de «sin cuenta»: la ciega no sabe cuál manda.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «la que me dice cuánta plata tiene la empresa» |
| Primer intento | no: cuánto hay ✓, si alcanza «no puedo asegurarlo», anotar la planilla **no** (iría a Gastos) |
| Pasos | 9 (sin terminar) |
| Dudas | 11 |
| Palabras no entendidas | 10 |
| Errores evitables | 3 (anotar la planilla en otro lado; «Por pagar» para algo ya pagado; guardar bajo «Tienda Lima» cuando el banco es de la empresa) |

## Antes de decir «listo»
- Concurrencia: `/chaos` 2026-10-16: doble clic, ráfaga de 10, dos pestañas, mismo token: una sola fila; invariantes limpias. · Caída externa: red cortada o respuesta perdida al registrar → «Se cortó la conexión… revisa si ya aparece registrado», lo escrito se conserva y el reintento no duplica (token). Si `fn_cuentas_dinero_saldos` falla, `fallas` lo dice arriba. · Persona sin contexto: ciega ✓ (sobre capturas; no completó la tarea nueva) · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,3 | 4 | — (primer análisis; los 3 cambios esperan OK; el hallazgo de «no pediste» arreglado en la web el mismo día) |
