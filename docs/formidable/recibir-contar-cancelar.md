# /formidable · Inventario ▸ Recibir mercadería ▸ Contar — lo nuevo del PR #1616 (2026-11-03)

> **Nota al fusionar con `main` (2026-11-03):** la ✕ y la fila de la categoría como total que se calificaron aquí se descartaron: #1617 (ADR-0604) entregó su propia versión (tacho y Contar sin «Total»). De esta calificación solo sigue vigente lo de la hoja «Cancelar la recepción» (por ejemplo, el motivo con 3 caracteres visibles); lo de la ✕/Deshacer y el total ya no aplica al código.


Lo nuevo: la ✕ que saca del envío un modelo o una categoría agregados, la fila de la categoría que ES el total (ya no hay «Total de X» aparte) y la hoja «Cancelar la recepción» (menú «Más»). ADR-0605.
Evidencia: ERP de la rama contra un banco propio y desechable (1055 migraciones desde cero), cuenta de prueba del seed; Chrome sin pantalla (Playwright). **Medido** a 1440, 1024 y 375 · **Observado** con 4 agentes: medidor, prueba ciega (agente sin contexto: no una colaboradora real), revisor de leyes y escéptico · **Opinión** solo donde se dice.
No se probó con una persona real de la tienda. No se midió 1920 ni el modo oscuro a 375.

## Notas
- **9 leyes: 6,6/10** (revisor, sobre código y capturas). Sin 1 (6), 2 (7), 3 (7), 4 (6), 5 (7), 6 (5), 7 (8), 8 (7), 9 (6).
- **Oficio visual: 6/10** (medidor: 8 de 14 comprobaciones pasan; contraste, foco, tamaño con mouse, orden de Tab y modo oscuro bien; baja por la pérdida de foco, el truncado a 1024 y el asa de la hoja a 375).
- **Prueba ciega (Observado):** las 3 tareas se lograron sin ayuda (sacar un envío de la lista: 4 clics; sacar «Prueba»: 1 clic; dejar el total en 7: 1 clic + 2 teclas). Dudas literales: «¿cuál ✕ es la de Prueba?», «MÁS no dice nada», «¿por qué cambió a Anillos?» (esto último ya existía).

## Lo que el escéptico confirmó y lo que refutó
Confirmado, del PR: **#9** «Deshacer» no devuelve lo agregado y sin contar; **#11** un motivo de solo caracteres invisibles se guarda; **#10** la ✕ pasa de rojo a tinta al pasar el mouse; **#2** a 1024 el resumen de la categoría se corta («3 contadas · 1 …») por el `padding-right`; **#8** la hoja trae una frase que nunca aplica («se cuadra y se cierra»); **#4** una categoría con total y sin modelos muestra un chevron que abre un cuerpo vacío.
Parcial: **#5** hay dos ✕ de la misma categoría (fila y placa) y la de la placa se llama «Quitar Total de Abrigos»: quien quiere sacar «Prueba» puede quitar la categoría entera (se recupera con «Deshacer», 7 s); **#3** a 375 el asa de `<Modal>` tapa el título (ya existía, no es del PR) pero «Cancelar la recepción de ENV-000008» parte el número también a 1440; **#13** el pie de la hoja se arma a mano (igual que `ReabrirEnvio`); **#14** la guía de Recibir no menciona la ✕ ni «Más ▸ Cancelar recepción».
Refutado o descartado: **#12** ✕ de 32 px (el mínimo con mouse es 24/32; con dedo solo exigen 44 Vender, Cambios y Devoluciones), **#1** el foco se pierde al cerrar cualquier hoja (sistémico), **#6** y **#7** son decisiones de Felipe («los únicos cambios que se requieren son la ✕, el anular recepción y el total»).

## Los 3 cambios que más valen (propuestos, SIN aplicar: esperan el OK de Felipe)
1. **«Deshacer» que de verdad deshace (ley 7, Observado).** Antes: ✕ sobre una categoría recién agregada y sin contar → «Deshacer» no la devuelve. Después: Deshacer la vuelve (se mantiene su clave en lo agregado) o no se ofrece cuando no había nada contado. Se verifica con el mismo caso del escéptico.
2. **La ✕ de la placa no puede quitar de más (leyes 1 y 2, Observado).** Antes: «Quitar Total de Abrigos del envío» en la placa borra Abrigos entero, «Prueba» incluida. Después: se quita la ✕ de la placa cuando se cuenta el total (la fila de la categoría ya tiene la suya) o se rotula «Quitar todo Abrigos del envío». Se verifica: la persona de la prueba ciega elige la ✕ correcta de «Prueba».
3. **Un motivo con letras de verdad (Observado).** Antes: tres caracteres de ancho cero habilitan el botón y quedan como «motivo». Después: la hoja exige 3 caracteres visibles. El candado de la base (`cancelar_recepcion_envio` y `reabrir_envio`, ADR-0393) es de Felipe.

Casi gratis, de paso: CSS de la ✕ que se queda roja al pasar el mouse (una línea), borrar la frase «se cuadra y se cierra», que el resumen de la categoría no se corte a 1024, y acortar el título a «Cancelar ENV-000008».
Lo que sobra (ley 8): la ✕ de la placa cuando la fila ya la tiene. Lo que Felipe no pidió y importa: una frase en el paso «agregar» de la guía de Recibir.

## Antes de decir «listo» (CLAUDE.md global)
- **Concurrencia:** probada en la base con dos sesiones (cancelar vs cancelar, vs contar, vs cerrar): nunca quedan dos estados (ver `/chaos`).
- **Caída externa:** red caída y respuesta perdida al cancelar: mensaje claro y el reintento no duplica.
- **Persona sin contexto:** la prueba ciega lo respondió (con un agente, no con una colaboradora real: sin probar con gente de la tienda).
