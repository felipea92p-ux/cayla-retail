# 2026-11-06 · Estados financieros: errores que Felipe vio en la captura

- **Comparación con el mes pasado «a esta fecha» sin sueldos:** la base pone la planilla en el mes donde termina el período de Dynamic (el 28), así que «octubre del 1 al 6» salía con S/ 0 de sueldos mientras noviembre llevaba los suyos provisionados; el chip «S/ 13,615 menos que octubre» exageraba la caída. Ahora la comparación lleva la parte de los días corridos de la planilla de todo el mes (`sueldosAEstaFecha`, `getEstadoResultadosAEstaFecha`; solo en el mes en curso).
- **La frase del mes en curso** dice «Vas perdiendo… el mes recién empieza» en vez de «Perdiste»; **la raya del cero** ya no se sale del gráfico (con todos los meses en pérdida caía encima del chip); **todos los montos** de Estados financieros van con dos decimales, también la cifra grande que rueda.
- Sin verificar en el navegador (no hay base local levantada en este worktree): pruebas unitarias, typecheck y Knip en verde. La diferencia de S/ 113 de Bancos que bloquea el Balance es de datos (Producción y saldos de arranque), no de la pantalla. Maqueta de los tres caminos de rediseño en `docs/maquetas/estados-financieros-2026-11-rediseno/`, esperando que Felipe elija.

## Rediseño: camino «A · El informe» (misma fecha, `/construir`, 5 actividades)

- Los cuatro estados se leen como informe fila por fila con los períodos de antes, el peso de cada fila y «Nombres del contador»; a la derecha la respuesta. El Balance que no cuadra se dice en una línea. Salen la tela de Hilos, las lentes, `EstadoVidrio` y las piezas que solo él usaba. ADR-0611 actualizado (2026-11-06) y CLAUDE.md al día.
- Verificado en el navegador local a 1440 px: Ganancias y pérdidas (abrir una fila, nombres del contador) y Flujo de efectivo; guías recorridas en las tres pantallas con datos. Patrimonio y el bloqueo del Balance no se pudieron ver: la base local no tiene `fn_patrimonio_cambios` ni un Balance que no cuadre. Sin mirar en modo oscuro ni a 375 px.
