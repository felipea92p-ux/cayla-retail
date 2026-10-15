# «Buscar» al apretar — una sola pieza (ADR-0358, ronda 15)

**Decidido:** 2026-10-15, Felipe, **tocándolo** (página de elegir; fuentes en [rondas/15](rondas/15/README.md)). **Elegida:** P1. **Pieza:**
`<BotonBuscar>` (`components/ui/BotonBuscar.tsx`).

Lo que busca recién al apretar: el padrón de SUNAT con un DNI o un RUC, unir dos clientes, un apartado por DNI, una venta en Cambios y
Devoluciones. Un buscador que busca mientras se escribe es `<Buscador>` (ronda 5), no esto.

## Lo que eligió

**P1 · el secundario con la lupa delante**, la misma del buscador; `peso="primario"` solo si buscar ES el paso de esa hoja (la búsqueda de
Cambios y Devoluciones, la pantalla Buscar). Mientras consulta, «Buscando…» con el hilo (ronda 12). Hoy no tenía ícono.

## Migración (2026-10-15)

**Deuda 0.** La consulta de DNI o RUC, unir clientes (la ficha de un cliente), buscar al cliente de un apartado, la búsqueda de una venta en
Cambios y Devoluciones, y la pantalla Buscar.

## Firmas

Un `<Boton>` o un `<button>` cuyo texto es «Buscar» (hasta 3 líneas). Con el código de antes reconoce 5 archivos.
