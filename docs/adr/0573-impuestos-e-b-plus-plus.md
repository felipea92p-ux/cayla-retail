# ADR-0573 · Impuestos «E · B++»: una respuesta, la cuenta en líneas y una fila de tres

- **Fecha:** 2026-10-29 · **Estado:** construido y probado en local con datos inventados (1440 y 375 px, claro y oscuro, tres estados). Sin migración. Sin tocar los cálculos del IGV.
- **Decide:** Felipe, 2026-10-28 (eligió la dirección B de la maqueta `docs/maquetas/impuestos-simple-2026-10/`, pidió completarla, el menú «Descargar» y textos compactos).
- **Toca:** ADR-0195 (F8 Impuestos) y ADR-0493 (El telar de Finanzas). Reemplaza la balanza, «Antes de declarar», el límite de cuatro frases y los sobres.

## El problema primero

La pantalla de Impuestos tenía cinco bloques que decían casi lo mismo (aviso de «se declara ahora», balanza, lista, límite, sobres, nota de pie) y mucho texto.
Felipe pidió «texto compacto, solo lo necesario y preciso» y que el botón de descarga no bajara todo sin preguntar.

## Qué se decidió

1. **Una sola respuesta grande («Pagas»)** en el cuerpo, con cuándo se paga, lo que falta hacer y «Registrar pago» (lleva a Cuentas y dinero). A su lado, la cuenta en líneas:
   vendiste → IGV de tus ventas − IGV de tus compras (se abre para ver de dónde sale) + renta = pagas.
2. **Una fila de tres:** pendientes con su monto, el límite del año (con marca de aviso y proyección) y el IGV de cada mes en barras.
3. **«Descargar» abre un menú** (`MenuAcciones`): todo el paquete (ZIP), registro de ventas, registro de compras o resumen del IGV. El resumen suelto es nuevo.
4. **El porcentaje de la renta NUNCA se escribe en el código.** Sale del parámetro `renta_pago_cuenta` del año (Configuración ▸ Impuestos). Hoy vale 1 % y es provisional.
   Si el contador confirma 1,5 % (o un coeficiente), se cambia ahí y toda la pantalla lo sigue. La pantalla dice «por confirmar» mientras el parámetro sea provisional.
5. **Las barras de meses muestran el IGV del mes** (ventas − compras; verde si quedó a favor), no «IGV + renta»: la tasa de la renta es del año y la base no la guarda mes a mes.

## Lo que se aparta de El telar, y por qué

- La respuesta no va en la cabecera (`RespuestaTelar`) sino en una tarjeta del cuerpo: Felipe eligió esa disposición en la maqueta. La cabecera queda con la sede, el título y «Descargar». Si la base no responde, la cabecera sigue usando `RespuestaTelar` con el motivo.
- Se retiran la balanza, «Antes de declarar» (la lista del cuerpo), el pulso y los sobres. La lista de «Antes de declarar» sigue existiendo en `lib/impuestos-antes-reglas.ts` porque la lee «Te toca» (`/api/finanzas/te-toca`).
- El dock de la barra común se queda como estaba.

## Lo que NO se pudo mostrar todavía (decisiones de Felipe o del contador)

- «Vence en N días» y «Pagado el …»: la fecha depende del último dígito del RUC, y unir cada pago a SUNAT con su mes no existe. Hoy dice «Se paga en octubre».
- «Por lugar» (IGV por sede) y «Lo que viene en el año» (renta anual, ITAN, SIRE): salen de la pantalla hasta que se decidan.
- **Tasa del pago a cuenta:** el sistema guarda UNA por año, desde el 1 de enero. El Régimen MYPE sube de 1 % a 1,5 % (o al coeficiente, el mayor) desde el mes en que las ventas pasan las 300 UIT.
  Si Felipe quiere que la pantalla lo calcule mes a mes, hace falta un cambio en la base: no se hizo.

## Qué se probó

`lib/impuestos-cuenta-reglas.test.ts` (16 casos): la cuenta cierra, la tasa sale del parámetro, sin tasa no hay porcentaje, las compras se desglosan y suman, a favor, mes sin movimiento, mes en curso,
pendientes con monto, límite (ok, sin configurar, cruzado) y barras. Pantalla vista en navegador con datos inventados. **No se corrió** `pnpm --filter web tema:auditar` (necesita cuentas y base) ni `/formidable`.
