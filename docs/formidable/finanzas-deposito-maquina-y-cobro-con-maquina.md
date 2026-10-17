# Formidable · Cobro con máquina (Vender) y Depósito de la máquina (Cuentas y dinero)   (`/vender`, `/finanzas/dinero`)

- **Fecha / SHA:** 2026-10-17 · base `f5b58e023` (rama `claude/upbeat-euclid-d973d1`, PR #1138, ADR-0429) · **Dispositivo que manda:** la hoja de cobro, **375 px** (Vender, PL-105); el depósito, escritorio (Finanzas).
- **Pregunta que debería resolver:** «¿Con qué máquina pasé la tarjeta?» (hoja de cobro) y «¿Cuánto se quedó la máquina de comisión?» (depósito) · **Protagonista:** el dinero.
- **Veredicto en una línea:** «Se entiende en unos segundos y se completa sola con los valores de fábrica; le falta que el dinero se vea exacto, que la máquina elegida se vea elegida y que el depósito diga con palabras de tienda qué hace con la comisión.»
- **Corrida:** medida en Chrome del sistema sin ventana (el panel del navegador estuvo oculto), pila Supabase propia con las migraciones de la rama, datos inventados (una venta de S/ 149.90 con tarjeta en Trujillo, atrasada 7 días). Costo: 3 agentes (dos pruebas ciegas de Sonnet sobre capturas y un escéptico).

## Notas (0–10)

| Eje | Hoja de cobro | Depósito | Evidencia |
|---|---|---|---|
| 1 Sin manual | 7 | 7 | [Observado] ciega A: en 3 toques sabe qué hacer, pero duda cuál máquina está elegida y en celular no ve dónde se elige el comprobante · ciega B: completa en 3–4 toques, duda de «S/ 150» contra «S/ 149.90» · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | 8 | [Medido] una sola acción primaria en el depósito; en la hoja, la máquina solo se pregunta donde hay dos |
| 3 Simplicidad profunda | 8 | 7 | La máquina de fábrica ya viene marcada; la comisión «sale sola» pero no se ve hasta teclear el monto |
| 4 Lenguaje de tienda | 7 | 6 | [Observado] ciega B no entiende «gasto bancario (639)»; «Voucher» y «Movimiento» le suenan técnicos |
| 5 Contenido primero | 7 | 7 | |
| 6 Lo difícil, a un toque | 6 | 6 | Ninguna de las dos dice «¿Por qué?»: qué pasa si eliges mal la máquina, de dónde sale la comisión |
| 7 Perdonar antes que preguntar | 6 | 7 | [Observado] A: «no sé qué consecuencia tiene elegir la equivocada ni cómo se corrige» · el depósito se anula con motivo |
| 8 Quitar antes de agregar | 8 | 7 | |
| 9 De punta a punta | 6 | 6 | A 375 px la frase «Cobra en … y confirma» queda tapada por el pie y el comprobante bajo el pliegue; ninguna ciega vio el estado de éxito |
| **Leyes (promedio)** | **7,0** | **6,8** | Ninguna ley bajo 6. La ley 1 no pasa de 8 sin pasada real |
| **Oficio visual** | **6** (provisional) | **5** | [Medido] ver abajo |

**Oficio, hoja de cobro (1440, 1024 y 375 px, medido solo dentro de `.hoja-cobro`):** propio de este cambio, 1 falla: los botones «Izipay» y «Vendemás» y la pregunta miden 11 y 11,5 px (mínimo 12). Heredado de la hoja de cobro, que no tenía medición: nombres de medios de 9 a 10,6 px, «Elige el comprobante» a 4,15:1, más de 3 radios distintos, bordes a 1–3 px. A 375 px: «Volver al ticket» de 34×34 (heredado). Cero blancos bajo 24 px con mouse.
**Oficio, depósito (1440, 1024 y 375 px, medido dentro del modal):** 4 de 8 fallan: la casilla de cada día mide 20×20 y es el único blanco de la fila, la ayuda mide 11,5 px, un borde a 2 px y un hueco de 5 px. A 375 px los campos del kit de Finanzas miden 38 px (Finanzas es de escritorio: pesa menos). Cero hallazgos de contraste propios.
**Tema (`tema:auditar`, claro y oscuro):** **0 hallazgos solo en oscuro** en las 8 visitas de las dos pantallas y las dos hojas nuevas; escritorio y 375 px.

## Los 3 cambios de mayor impacto (esperan el OK de Felipe)

1. **El dinero a la vista, exacto** (leyes 1 y 3; **toca dinero, decide Felipe**). En el combo «De» del depósito y en la tarjeta «Por depositar», el saldo sale «S/ 150» mientras el aviso y el día marcado dicen «S/ 149.90»: la ciega dudó de «una diferencia de 0.10». Después: las cuentas «Por depositar» y el combo «De» muestran el saldo con céntimos (las demás cuentas siguen como están). No cambia ningún cálculo. Verifica: repetir la ciega B y que no dude. Esfuerzo S.
2. **El depósito que se explica solo** (leyes 3 y 4; solo presentación). (a) El ejemplo de «Monto que llegó al banco» pasa de «1,500.00» a lo que se espera (lo marcado menos la comisión estimada, o solo lo marcado) y «Comisión real» dice «Escribe lo que llegó y verás la comisión»; (b) «Queda como gasto bancario (639) de la empresa» pasa a «Queda anotada como gasto de la empresa» y «Voucher o nota» a «Número de operación o nota»; (c) abierto desde el aviso, el título dice «Depósito de Vendemás» en vez del genérico «Registrar movimiento». Verifica: ciega B sin dudas de palabras. Esfuerzo S.
3. **La hoja de cobro que se ve completa en el celular** (leyes 1, 7 y 9; presentación, **sin tocar el cobro**). (a) La máquina elegida lleva el ✓ que ya llevan los medios (hoy solo cambia el relleno y la ciega dudó cuál estaba elegida); (b) los botones suben de 11 a 12 px; (c) a 375 px, al elegir el medio la hoja baja sola hasta el comprobante, como ya hace en escritorio, y la frase «Cobra en Vendemás y confirma» no queda tapada por el pie. Verifica: captura a 375 px antes y después y ciega A que termina el cobro sin duda. Esfuerzo M.

## Lo que sobra (ley 8)
- La frase de ayuda del recuadro «Qué días cubre este depósito» repite lo que ya dice la guía y la propia lista; propongo dejarla solo cuando no hay nada por depositar.
- El «Voucher o nota» y «Comisión real» llevan cada uno su ayuda en 11,5 px: con el cambio 2 una de las dos sobra.

## Lo que no pediste y importa más
Elegir mal la máquina en la hoja de cobro manda la plata a la puente de la otra máquina y el error solo se descubre días después, cuando un depósito «no cuadra» con sus días. La ciega A lo dijo con sus palabras: «sé que no está bien, pero no sé qué consecuencia tiene ni cómo se corrige». No verifiqué si la pantalla ofrece corregir la máquina de un cobro ya guardado; según la nota de diseño del ADR-0429, una corrección de pagos lo vuelve a sellar con la máquina de fábrica sin preguntar. Antes de usarlo en tienda conviene decidir quién y cómo corrige esa elección (es dinero: decide Felipe).

## Lista aparte (no se ejecuta)
- H7 · La casilla de cada día mide 20×20 y la fila no es clicable entera: es la pieza `Casilla` del sistema (se corrige una vez para todas, con un `<label>` que envuelva la fila).
- H1 · El doble borde de la máquina NO elegida parece «foco»; con el ✓ del cambio 3 deja de confundir.
- Heredado de la hoja de cobro, que no tenía medición: nombres de medios de 9 a 10,6 px, «Elige el comprobante» a 4,15:1, «Volver al ticket» de 34 px a 375 px.
- Heredado de Configuración: la tabla de cuentas (`ConfiguracionCuentas`, `minWidth: 640` en línea) se corta a 375 px por el mismo motivo que arreglé en la de máquinas.
- El estado de éxito (el aviso «Depósito de la máquina registrado») no se vio en ninguna ciega: se probó con capturas del estado inicial, no del final.

## Prueba ciega
| Medida | Hoja de cobro (Sonnet, sobre 4 capturas) | Depósito (Sonnet, sobre 2 capturas) |
|---|---|---|
| Lectura de 5 s | acierta: «elegir cómo pagó; sigue tocar Tarjeta» | acierta: «ver el aviso de la máquina y registrar el depósito» |
| Primer intento | sí | sí |
| Pasos | 3 toques (4 si cambia de máquina) | 3–4 toques |
| Dudas | cuál máquina está elegida (doble borde); «Cubierto ✓» contra el botón gris; dónde se elige el comprobante en celular; si «Lucía» es ella | «S/ 150» contra «S/ 149.90»; el ejemplo «1,500.00»; si «Comisión real» se edita; si «Interbank» es su banco |
| Palabras no entendidas | «comprobante», «responsable», «cubierto» | «gasto bancario (639)», «voucher», «conciliación», «movimiento» |
| Errores evitables | ninguno | ninguno |

Escéptico (Sonnet, con el código): 8 hallazgos, 6 CONFIRMADOS, 2 MATIZADOS (H1: el estado se distingue por relleno, no hay ✓; H2: «Cobra en … y confirma» sí aparece en 375 px, pero queda tapada por el pie fijo; el scroll hasta el comprobante está apagado en la hoja compacta), 0 refutados, ningún problema grave nuevo.

## Antes de decir «listo»
- **Concurrencia:** sin probar en esta corrida. La nota de traspaso dice que la suite de Postgres de la rama cubre el cruce de un mismo día dos veces (`pos_abonos_lotes`); no lo volví a ejecutar.
- **Caída externa:** no hay llamada externa; si la base no responde, el modal conserva lo escrito y avisa (loader y avisos del sistema).
- **Persona sin contexto:** ciegas con Sonnet sobre capturas, sin colaboradora real: «sin probar».

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-17 | `f5b58e023` | 7,0 (hoja de cobro) · 6,8 (depósito) | 6 (provisional) · 5 | ninguno aún; esperan el OK de Felipe. Se cerraron aparte 4 defectos de la rama: CSS roto por la fusión, el aviso abría el depósito con la máquina equivocada, el ejemplo del voucher decía «Izipay» con Vendemás elegida, y la fila del día y la tabla de máquinas se cortaban a 375 px |
