## 🧾 Compradores «como tu banco» (2026-11-26, ADR-0704 act. d) — solo web, sin migración; rama `claude/compradores-como-tu-banco`

- [x] Compradores: una cifra («En la calle») y una línea por persona (frase, etiquetas de lo que toca, lo que le queda con su barra). Entra también quien cerró su ronda y dejó pendientes. Filtros, buscador desde 9 personas y «Ver N más».
- [x] Detalle: resumen, «Te toca» y estado de cuenta por fechas con el control de período de Rendimiento; subtotal por día, días viejos plegados y filtro «Pendiente» pasadas las 12 líneas. «Anular» en la línea de cada entrega.
- [x] Verificado: 24 pruebas de reglas con los datos de producción del día; tipos, lint y las pruebas que vigilan la pantalla (guías, unificar, letra, esquinas, beige, colores, hover) en verde; las dos pantallas vistas en local con datos reales y con un ejemplo inventado de 34 compras y 18 personas, a 1440 y 375 px, en claro y en oscuro; `/milimetro auditar` sin graves (`docs/milimetro/auditorias/2026-11-26-compradores-como-tu-banco.md`).
- [ ] **Sin probar con cuenta real ni con la base:** «Entregar plata», «Anular» dentro de una línea, la herramienta de revisión bajo el estado de cuenta, «Cerrar su ronda» dentro de «Te toca» y el cambio de período contra datos de producción. Se vio todo con una página sin base.
- [ ] **Sin correr:** `tema:auditar` (necesita un banco con cuentas), `guias:recorrer`, `/formidable` y `/chaos`.
- [ ] **Sin decidir:** ampliar el rango de fechas más allá de 30 días (hoy hereda los topes de Rendimiento y la lectura trae 60 días de rondas).
- [ ] **Anotado, no urgente:** `fn_compradores` lee el libro de dinero una vez por persona; con decenas de compradores hay que leerlo una sola vez.
- [ ] **El resto del módulo** (Entregar plata, la revisión, Todas las compras) sigue con su diseño de antes: Felipe pidió revisarlo todo.
