# Elegir el mes — una sola pieza (ADR-0358, ronda 17)

**Decidido:** 2026-10-17, Felipe, **mirando** (página de elegir con fotos en vivo y demos; fuentes en [rondas/17](rondas/17/README.md)).
**Elegida:** P1. **Pieza:** `<SelectorMes>` (`components/ui/SelectorMes.tsx`) y, en una pantalla que lee el mes de la URL,
`<SelectorMesEnUrl ruta mes actual>`.

## Qué se comparó

| Opción | Cómo se ve | Dónde estaba |
|---|---|---|
| **P1 · «‹ Octubre 2026 ›»** | una píldora: las flechas pasan al mes de al lado y, al tocar el nombre, se abren los doce meses del año (los que todavía no llegan, con candado; arriba, «‹ 2026 ›» para el año pasado). Desde el mes de hoy la flecha de la derecha se apaga | el Historial de cierres de Caja (Felipe la eligió el 2026-10-12) |
| P2 · los vecinos con su nombre | «‹ Septiembre» y «Noviembre ›» en botones secundarios chicos y el mes en serif al medio | (propuesta) |
| A · hoy | dos formas: la píldora en Caja, y en Comprobantes los vecinos en versalitas a mano con «←» y «→» escritos (`SelectorMesFacturacion`) | |

Finanzas elige el mes con su combo (`SelectFin`, `fin-mes-chico`) y queda aparte (ADR-0195).

## Lo que eligió

**P1**: un mes con las flechas y cualquier mes del año en dos toques, igual en todo el ERP.

## El movimiento

El de la pieza: la píldora de cada flecha y del nombre se tiñe de arena al pasar el mouse; la lista de los meses entra con el revelar de los
combos (240 ms) y su Escape no cierra la hoja de abajo.

## Migración (2026-10-17)

**Deuda 0.** Comprobantes ▸ Emitidos y Proformas pasan a `<SelectorMesEnUrl>`: elegir un mes navega a `?m=AAAA-MM`, como hacían sus enlaces
(un clic, con el loader). Las anclas de la guía (`comprobantes.mes`, `comprobantes.mes-anterior`) pasaron a la pieza (`guia`,
`guiaAnterior`) y los textos de las dos guías dicen lo nuevo. `SelectorMesFacturacion.tsx` se borró (y con él tres excepciones de
`familias.mjs`). Lo único que cambia además del dibujo: el mes más antiguo al que se llega es el de hace tres años (el de fábrica de la
pieza); antes no había tope, y el ERP no tiene comprobantes de antes de 2026.
