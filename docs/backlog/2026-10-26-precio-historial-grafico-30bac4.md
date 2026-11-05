## 💸 Historial del costo de la prenda (2026-10-26) — migración 20261024223000 EN PRODUCCIÓN (2026-10-26); rama `claude/precio-historial-grafico-30bac4`

Maqueta elegida: `docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html`. Decisiones de Felipe (2026-10-24): la forma A
(escalera), corregir el costo solo de la ÚLTIMA compra, y «Hoy: N prendas» como estimado (se vende primero lo que llegó antes).

- [x] 1 · Pestaña «Costo» con la respuesta y la tabla de compras (`fn_costo_de_la_prenda`, `lib/costo-prenda-reglas.ts`,
      `components/historial-prenda/CostoPrenda.tsx`; `pnpm pruebas:costo-de-la-prenda` en el CI).
- [x] 2 · Gráfico de escalera con números (`<Linea>` gana `escalones` y `marcas`; registro en `docs/unificar/grafico.linea.md`).
- [x] 3 · Errores arreglados del costo declarado (`erroresArreglados`; `<Linea>` gana `arreglos`).
- [x] 4 · «Hoy: N prendas»: cuántas quedan de cada compra, estimado PEPS (`lotesDeHoy`, barrido de 400 casos: siempre suma el stock).
- [x] 5 · Corregir el costo de la última compra (ADR-0515, `20261026160000`): `corregir_costo_de_compra` solo líder con motivo y banda de ADR-0298,
      `costo_correcciones` (solo agrega), `fn_costo_historial_efectivo`, vista previa; hoja `CorregirCostoModal` con guía de foco; `pnpm pruebas:costo-corregir-compra`;
      `/chaos` semilla 515 (1 hallazgo g2, arreglado) y prueba de punta a punta (1 defecto de la web, arreglado).
- [x] 6 · Cierre: `guias:recorrer` a 1440, 375 y en oscuro, `tema:auditar` (0 solo en oscuro), `/formidable` (informe; 3 cambios esperan OK de Felipe).
- [x] **PEGADA en producción** `20261026160000_corregir_costo_de_compra.sql` el 2026-10-26, con el OK de Felipe (`apply_migration` «corregir_costo_de_compra» y una segunda «corregir_costo_de_compra_comentarios_exactos»: la primera quitó los comentarios de los cuerpos y cambió `prosrc`; la segunda repone el texto exacto). Comprobado: las 6 funciones tienen el mismo `md5(prosrc)` que en local (corregir 7c702c8f…, vista previa f68500ab…, lectura 308b8da4…, corregible 983bcc61…, cálculo 3948802a…, efectivo 5ce9cb34…); `anon` no ejecuta ninguna; la tabla `costo_correcciones` tiene RLS, 0 filas y la web no la lee; como líder real (en `begin…rollback`) la lectura trae `puede_corregir: true` y la vista previa responde. **Falta:** refrescar el diccionario de datos (`costo_correcciones`) y probar la hoja con una cuenta de líder real.
- [x] Los 3 cambios de Formidable (`docs/formidable/catalogo-costo-correccion.md`), aprobados por Felipe y aplicados: el pie no repite «Guardar» con el aviso de costo raro, párrafo de arriba más corto, aviso sobre el pie fijo. Falta re-medir con prueba ciega.
- [x] **El gráfico de escalera se pisaba con compras cercanas** (6 compras en 2 días): `marcas` ahora separa los números a 26 px (`lib/linea-marcas-reglas.ts`), con un hilo hasta su punto y el texto solo si cabe; registro en `docs/unificar/grafico.linea.md`.
- [ ] Confirmar con Felipe que el costo de una compra es «sin IGV» en Recibir (la hoja lo promete).
- [ ] `docs/datos/generado/`: el diccionario no tiene todavía `costo_correcciones` (entra al aplicar la migración en producción).
- [x] **Pegada en producción** 20261024223000 el 2026-10-26, con el OK de Felipe: md5(prosrc) = cdbef27edac56c0e830b07821b9cecca (igual que en local); anon no la ejecuta; con un líder lee las compras de una prenda real.
- [ ] **Sin probar con una cuenta real:** se verificó con datos de ejemplo sacados de la base local, sin sesión.
- [ ] Los arreglos de costo hechos entre el 23 y el 26-sep quedaron anotados como `costo` (antes de 20260927190000) y no salen
      en «Errores arreglados».
