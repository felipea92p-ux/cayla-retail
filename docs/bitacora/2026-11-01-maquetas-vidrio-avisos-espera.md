# 2026-11-01 · Maquetas del vidrio: el sistema que habla (ADR-0596)

- **Reparto:** las piezas «Por auditar» del tablero se repartieron entre dos sesiones. Esta hace avisos de la esquina, loader y versión nueva, y
  después acciones chicas y el selector de mes. La otra (rama `claude/maquetas-vidrio-pendientes-213be4`) hace vacío y paginación, casilla y
  enlaces, gráficos, avatares, la barra y el cajón del celular, e íconos.
- **Avisos de la esquina, loader y «Hay una versión nueva»:** maqueta `docs/maquetas/avisos-espera-vidrio-2026-10/`, sobre Proveedores. En los
  avisos: «Como ahora», A · Placa Serena, B · Lente del tono (recomendada) y C · Isla ahumada. En el loader: «Como ahora», A · Hoja Serena
  (recomendada) y B · Lente sola. En la versión nueva: «Como ahora», A · Gota ahumada (recomendada) y B · Gota de vidrio claro. Se copió la
  coreografía real de `avisos.css`, y la gota sin cambios: solo cambia el material. Con la cabecera «Dos islas», la píldora baja bajo la
  cabecera, porque el buscador ocupa la banda donde hoy se centra. Se capturó en claro y oscuro, a 1440 y 375 px, sin errores. Sin cambios en `apps/web`.
- **Lo que eligió Felipe:** avisos B · Lente del tono, loader B · Lente sola y versión nueva A · Gota ahumada. En el loader no tomó la
  recomendada (la hoja Serena). Como las palabras del loader van sueltas, se les puso detrás un halo de crema sin borde, para que se lean
  aunque detrás pase algo oscuro; se miró en claro a 1440 px y en oscuro a 375 px.
