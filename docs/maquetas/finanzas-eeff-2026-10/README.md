# Finanzas ▸ Estados financieros · maqueta (2026-10-30)

Pedido de Felipe (pizarra «4. Reportes», 30-oct): cambiar el nombre a EE.FF.; escribir lo financiero en lenguaje simple; tener los cuatro
estados (Balance, G y P, Flujo de efectivo y Cambios en el patrimonio); que sea muy visual, simple e interactivo; y que traiga
recomendaciones. Respuestas de Felipe: se llama **Estados financieros**; lo ve todo quien tenga el módulo en Roles y accesos; en lo demás,
lo que se recomiende después de investigarlo.

- **La maqueta:** `index.html` (publicada para Felipe en https://claude.ai/artifact/UiZ2Pk8rnPkLYNLcDBo7kV, privada), un solo archivo que se abre en el navegador, en claro y oscuro, de 375 a 1920 px. Rutas: `#ganamos`,
  `#plata`, `#vale` y `#tuyo`. **Las cifras son de ejemplo** y cuadran entre sí: la ganancia por sede (+6,120 · +2,480 · −1,450 · −620 ·
  −2,680) suma S/ 3,850, el Balance da 142,300 = 38,700 + 103,600 y el flujo va de 31,200 a 27,450.
- **No se tocó** código de la app, migraciones ni producción.

## Lo que propone

1. **Las cuatro respuestas son las pestañas.** Cada tarjeta lleva el nombre formal en chico, la pregunta, la cifra y un veredicto:
   ¿Ganamos? (G y P) · ¿Dónde está la plata? (flujo) · ¿Cuánto vale CAYLA? (Balance) · ¿Lo tuyo creció? (patrimonio). Van primero las
   dos que se miran cada mes. La descarga para el contador sale en el orden formal.
2. **Cada estado es un dibujo, no una tabla.** La cascada que va de la venta a la ganancia; el puente de la plata, que se separa en
   «del día a día», «compras que duran años» y «tú y los préstamos»; la balanza del Balance; y lo que movió lo tuyo. Al tocar una fila se
   ve de dónde sale la cifra. El formato formal queda plegado al pie («Ver el formato formal»).
3. **«Qué te recomiendo»**, al lado: hasta 3 acciones que salen de las cifras del estado, cada una con su botón.
4. **Las palabras difíciles** (margen, desgaste, lo tuyo, día a día) se explican con un toque.
5. **La sede y el mes** vienen de la barra del telar (ADR-0493). Flujo y Patrimonio son de toda CAYLA, y la pantalla lo dice en una
   línea.

## Qué pasa con Presupuesto, Campañas y Escenarios

Ninguno es un estado financiero.

- **Presupuesto** sí sirve para decidir: comparar lo planeado con lo real cada mes es el control más útil de un negocio chico, siempre
  que se miren solo los desvíos grandes (de 5 a 10 % o más). Pasa a ser una marca de «lo planeado» en cada gasto de ¿Ganamos?, con una
  recomendación cuando el gasto se pasa del 10 %.
- **Escenarios** se usa de vez en cuando. Pasa a «¿Y si…?» dentro de «Lo que viene» del flujo, que es donde se mira la plata. No guarda nada.
- **Campañas** se usa al cerrar cada campaña. Aparece como recomendación en ¿Ganamos? el mes en que una campaña cerró.

## Para construirlo

- Ya existe en la base: G y P (`fn_estado_resultados`), el Balance con su comprobación, el flujo real y su proyección
  (`lib/flujo-caja-reglas.ts`, con categorías como `dueno_pone`, `dueno_saca` y `activos`), los aportes y retiros del dueño
  (`movimientos de dinero`: `aporte`, `prestamo` y `retiro`), el presupuesto y las campañas.
- Falta: agrupar el flujo en sus tres partes, armar el estado de cambios en el patrimonio (capital, resultados acumulados, aportes y
  retiros) y quitar el «solo el líder» de Flujo y Escenarios (lo decide el módulo).
- Al cambiar el nombre del menú cambian `lib/menu.ts` (`finanzas.reportes`), su guía y su huella. La clave del módulo,
  `reportes_financieros`, no se renombra.

## De dónde salen las decisiones

- Ireland, Small Firms Association (2019): el 42 % de los dueños de empresas pequeñas no entiende los estados financieros, y solo el
  34 % los usa para decidir. https://www.lawsociety.ie/gazette/top-stories/2019/09-september/financial-literacy-is-low-in-small-firm-owners
- Flujo por el método directo, el que se lee como «cobraste / pagaste» y es el que prefieren las normas:
  https://www.accountingtools.com/articles/2017/5/17/cash-flow-statement-direct-method ·
  https://smallbusiness.chron.com/advantages-preparing-cash-flow-statement-using-direct-method-23694.html
- Presupuesto contra lo real como hábito de cada mes, que debe terminar en una acción y mirar solo los desvíos grandes:
  https://www.supportingstrategies.com/blog/how-budget-vs-actual-reporting-helps-small-businesses-make-better-decisions/ ·
  https://www.thp.co.uk/budget-vs-actual-analysis/
