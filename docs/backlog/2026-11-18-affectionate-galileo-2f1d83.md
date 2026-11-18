## 📌 El pie pegado de una hoja y la reserva de la página (2026-11-18, ADR-0185 act.) — solo web, sin migración; rama `claude/affectionate-galileo-2f1d83`

- [x] `<PaginaEstable>` escribe el relleno de la reserva sin transición (`pintarReserva`): con las animaciones apagadas la vista ya vuelve a su lugar, en hojas y en páginas. Medido: «Registrar proveedor» 715 → 715 (antes 626, con el relleno alternando 28/117 px); una página, `scrollY` 938 → 938 (antes 722 → 322).
- [x] La reserva de una hoja se publica en `--reserva-abajo` y `.pie-hoja-fijo` baja lo mismo, sin transición. Medido a 1024 × 768 y a 375 × 812, claro y oscuro, en «Registrar proveedor» y «Registrar gasto»: el pie en el borde de abajo, 0 px encima del contenido, 0 px de hueco.
- [x] Pruebas: `lib/pagina-estable-pie.test.ts` (10). Suite completa, tipos, eslint, `knip` y `knip:produccion` en verde.
- [ ] **Pasar a `pie-hoja-fijo` los tres pies pegados hechos a mano:** `components/apartados/ModalesApartado.tsx` (`sticky -bottom-6`), `.parecidas-hoja-pie` (`app/estilos/alta-parecidas.css`) y el de `components/orden-produccion/FichaOrden.tsx`. Hoy siguen quedando arriba cuando la hoja reserva.
- [ ] **Revisar qué más escribe un estilo y mide en el mismo tick.** Con las animaciones apagadas todo lleva una transición de 0,01 ms y la medida sale vieja. Solo se revisó `<PaginaEstable>`.
- [ ] **Sin probar:** Safari y un iPhone real; la barra de íconos de la vista rápida (`.vr-iconos`) con las animaciones encendidas; el caso de un `<form>` más corto que la reserva (ver «Lo que no cubre» en el ADR).
- [ ] **CAYLA Dynamic, a mano:** `pintarReserva` en su `PaginaEstable`, `VARIABLE_RESERVA` y `reservaPublicada` en sus reglas, las dos líneas en su `.pie-hoja-fijo` y la prueba. Nada llega solo (`recetas.css` no cambió).
