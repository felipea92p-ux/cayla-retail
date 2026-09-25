# ADR-0206 · En el celular, el menú es el lateral como cajón (☰), no una barra inferior

- **Fecha:** 2026-09-25 · **Estado:** Aceptado y construido. **Producción:** ninguna migración ni RPC; es solo pantalla.
- **Supera en parte:** ADR-0205 (se retiran la barra inferior y la hoja «Más», y el avatar de la cabecera; se queda la
  lupa). También ADR-0130 D8 («en celular no hay lateral, hay pestañas»).
- **Alcance:** `apps/web/components/AppShell.tsx`, `apps/web/app/globals.css` (`.cajon-lateral`, `.velo-cajon`,
  `data-pieza-cajon`), `lib/useConsultaMedia.ts`; se borra `components/MasMovil.tsx`. Las barras fijas que se subían
  4.25 rem para esquivar las pestañas (`BarraFija`, «Ver ticket» de Vender, ficha de Nuevo producto) bajan al fondo.
- **Decide:** Felipe, dos veces el mismo día: pidió el cajón («quiero hacer mejor un menú lateral con un botón superior
  izquierdo que lo despliegue»), y al traer `main` con ADR-0205 ya fusionado eligió el cajón frente a «barra + Más».

## Problema

La barra inferior del celular mostraba 4 de los 15+ módulos. ADR-0205 le sumó «Más», una hoja con el árbol completo.
Resolvía el acceso, pero dejaba dos formas de menú distintas: pestañas + hoja en celular y lateral en escritorio. Cada
módulo nuevo tenía que decidir si iba a la barra, y la barra se comía ~68 px de alto en cada pantalla, además del
ajuste de 4.25 rem que tres barras fijas tenían escrito a mano.

## Decisión

- **D1 — El celular usa EL MISMO `<aside>` del escritorio**, deslizado desde la izquierda con el botón ☰ a la izquierda del
  logo. Una sola navegación: un módulo nuevo en `lib/menu.ts` aparece igual en los dos tamaños.
- **D2 — En el cajón el lateral va siempre expandido.** La preferencia «plegado» (cookie, ADR-0130) es solo de
  escritorio: `compacto = plegado && !esCelular`.
- **D3 — Se cierra** con la ✕, el velo, Escape o al tocar cualquier destino; bloquea el scroll de la página, queda
  `inert` cerrado y devuelve el foco al ☰.
- **D4 — Movimiento con la gramática de ADR-0136, de costado:** velo que se enciende (280 ms), cajón que entra en 420 ms
  (`--ease-cayla`) y sale en 260 ms (`--ease-salida`), piezas en cascada desde la izquierda (45 ms de desfase). Solo bajo
  640 px; con movimiento reducido no hay cascada.
- **D5 — Cabecera del celular:** ☰ · logo · sede · lupa (de ADR-0205). El avatar de ADR-0205 sale: «Mi perfil» y «Salir»
  viven al pie del cajón, como en escritorio.

## Lo que se aprendió en el camino

- **El cajón saltaba en vez de deslizarse.** Tailwind v4 pinta `translate-x-*` con la propiedad `translate`, y Lightning
  CSS reescribe `transition: translate` como `transition: transform` al compilar: la transición nunca calzaba. El
  desplazamiento vive en `.cajon-lateral` con `transform`, no en utilidades.

## Pendiente

- `COLUMNAS_MOVIL` y `menu.movil` (`lib/menu.ts`) ya no los pinta nadie. Se dejaron porque `menu.test.ts` los fija
  en sus perfiles dorados; retirarlos es un cambio aparte con su regeneración del dorado.
