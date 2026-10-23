# 2026-10-23 · Ofertas de una campaña — «Tres preguntas» (ADR-0490, solo en local)

- [ ] **Pegar `20261023190000_campana_reglas_de_precio.sql` en producción** (con el OK de Felipe, después de reservar el número: `pnpm reservar migracion` / `adr`, y de abrir el PR con `/abrir-pr`). Va de una vez (sin políticas ni `alter` sobre tablas en uso). Después, refrescar el diccionario (`pnpm datos:generar:produccion`): las 3 tablas nuevas.
- [ ] **Etapa 2 — las otras 14 formas** (soles menos, precio único, 3x2, la 2.ª al 50 %, un monto, un regalo, el Club…). Cada una cambia dinero en la caja: va por oleadas, cada una con su verificación en `registrar_venta`.
- [ ] **Los lectores que no pasan por `fn_campanas_en_sede`** no ven una campaña que solo tiene ofertas: portada de la tienda, `campana_detalle`, el reporte de Finanzas (`fn_campanas_reporte`), `tienda_diseno_*`, `fn_configuracion_tiendas` y `lib/precio-de-hoy.ts` / `lib/etiqueta-campana.ts`. Hacer que lean las ofertas, o que el reporte las cuente.
- [ ] **Etiquetas de precio impresas con días sueltos:** el papel colgado no cambia cada día; hoy solo se avisa. Decidir qué dice la etiqueta (el precio normal, o la palabra «martes y jueves»).
- [ ] **«¿Cuánto margen cedo?»** de la maqueta: hace falta la venta real por categoría (la maqueta usaba cifras inventadas).
- [ ] **Quedar en Actividad:** crear, activar y retirar una oferta cambia el precio en caja; hoy deja su historial propio, pero no su línea firmada en Actividad.
- [ ] **Guardar sin «Responsable»:** usa la clave `etiqueta_campana`; una terminal sin persona no registra ofertas. Decidir si una terminal debe poder dejar un borrador.
- [ ] **Las categorías de una campaña** (el universo «Elegir todas»): el formulario viejo ya no existe en Insignias y no hay dónde elegirlas. Decidir con Felipe: en la pregunta 2 de cada oferta (se suman a la campaña), solo para la oferta, o un botón «Categorías» chico en la franja.
- [ ] **Tienda web ▸ Campañas ▸ «Datos y prendas»** sigue abriendo la hoja de siempre (`CampanaModal`); en Insignias ya no. Decidir si esa ficha abre también la hoja de ofertas.
- [ ] El «descuento de siempre» de una campaña antigua (p. ej. −10 % de Aniversario) hoy solo se retira; falta «pasarlo a oferta» con un toque (crear la oferta con sus datos y retirar el descuento en la misma operación).
- [ ] La maqueta `docs/maquetas/ofertas-promociones-2026-10/index.html` todavía trae el formulario largo; reemplazarlo por «Tres preguntas» o borrarlo.
