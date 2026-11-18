## 🔤 La cabecera y el texto del ERP: más grande y más corto (2026-10-30/31, ADR-0358 rondas 18 y 19) — solo web, sin migración; rama `claude/simplified-collapsible-design-b21103`

- [x] Ronda 18: la frase de cada cabecera detrás del «?» de vidrio (`<AyudaCabecera>`). Registro: `docs/unificar/titulo-pagina.md`.
- [x] Ronda 19: `<Ayuda>` es el mismo «?» en chico, `<TituloSeccion ayuda>`, `.texto-bajada` / `.texto-detalle`, y lo que se lee a 14 px como piso en los trece módulos (un commit cada uno, fotos antes y después a 1440 y 375 px). Registro: `docs/unificar/texto.md`; familia `texto` con su firma y su deuda.
- [ ] **Deuda de `texto`:** 63 archivos fuera de los trece módulos (piezas compartidas, el escáner, las guías, el login, las barreras de error) todavía tienen párrafos de lectura bajo 14 px. Solo baja (`lib/unificar.test.ts`).
- [ ] **Sin mirar con datos:** las hojas que guardan (cobrar, cambiar, devolver, pagar, un conteo en curso, una recepción abierta, la página de una orden de producción o de compra, el editor de una campaña web). Sus textos se acortaron igual.
- [ ] **Sin mirar a 375 px:** Configuración ▸ Presupuesto, Impuestos y CLAURE (el servidor local no respondía con la máquina cargada).
- [ ] **Visto de paso, ya pasaba antes:** a 375 px `/vender/historial` se corre 5 px al costado (el globito de «Ventas por día»), `/rendimiento` 21 px y `/finanzas/reportes/campanas` 163 px.
- [ ] Las frases de «Te toca» del Inicio de almacén salen de `lib/` y siguen largas (acortarlas toca sus pruebas).
- [ ] La escala final de la letra: Felipe dejó el tamaño para después de condensar; quedó en 14 px como piso. Confirmarla o pedir otra.
- [ ] `guias:recorrer` con las guías que cambiaron de texto (pendiente desde la ronda 18).
