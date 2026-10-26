## 💸 Historial del costo de la prenda (2026-10-26) — migración 20261024223000 SIN pegar en producción; rama `claude/precio-historial-grafico-30bac4`

Maqueta elegida: `docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html`. Decisiones de Felipe (2026-10-24): la forma A
(escalera), corregir el costo solo de la ÚLTIMA compra, y «Hoy: N prendas» como estimado (se vende primero lo que llegó antes).

- [x] 1 · Pestaña «Costo» con la respuesta y la tabla de compras (`fn_costo_de_la_prenda`, `lib/costo-prenda-reglas.ts`,
      `components/historial-prenda/CostoPrenda.tsx`; `pnpm pruebas:costo-de-la-prenda` en el CI).
- [x] 2 · Gráfico de escalera con números (`<Linea>` gana `escalones` y `marcas`; registro en `docs/unificar/grafico.linea.md`).
- [x] 3 · Errores arreglados del costo declarado (`erroresArreglados`; `<Linea>` gana `arreglos`).
- [ ] 4 · «Hoy: N prendas»: cuántas quedan de cada compra, estimado PEPS, con prueba de que siempre suma el stock real.
- [ ] 5 · Corregir el costo de la última compra: RPC solo líder, motivo obligatorio, tabla nueva de correcciones (append-only,
      nunca editar `costo_historial`), hoja con guía de foco, prueba de base, `/chaos`, ADR. Necesita reservar ADR y migración.
- [ ] 6 · Cierre: recorrer la guía (`guias:recorrer`), `/formidable`, `tema:auditar`, sacar el PR de borrador.
- [ ] **Pegar en producción** 20261024223000 (solo crea una función de lectura; sin políticas) — con el OK de Felipe.
- [ ] **Sin probar con una cuenta real:** se verificó con datos de ejemplo sacados de la base local, sin sesión.
- [ ] Los arreglos de costo hechos entre el 23 y el 26-sep quedaron anotados como `costo` (antes de 20260927190000) y no salen
      en «Errores arreglados».
