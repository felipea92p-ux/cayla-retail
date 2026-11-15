# Fijar precio con la cuenta única (2026-11-15)

Nació de revisar el PR #1867: después de él, la línea «Ganas» de Recibir mostraba una cifra sin IGV bajo dos campos escritos con IGV, y
suponía «tiene RUC ⇒ trae factura», que en los datos de producción falla en el 64 % de los papeles. Felipe respondió 30 preguntas y aprobó
la maqueta `docs/maquetas/precio-sugerido-2026-11/index.html`. Detalle técnico (archivo:línea): `docs/investigacion/2026-11-15-precio-con-igv/`
(`plan-tecnico.md`, y `revision-esceptica.md`, que manda sobre el plan técnico).

## Las decisiones de Felipe

1. La integrante escribe y ve el costo **con IGV** (el total del papel, sin flete) y el precio **con IGV** (la etiqueta).
2. **Todas las prendas se cuentan igual**, vengan o no con factura: *te quedan = precio ÷ 1.18 − lo que pagaste*. Las facturas se suman
   aparte, en Compras, y nunca tocan el costo de una prenda: el IGV a favor se ve a fin de mes.
3. Se guarda siempre el costo del papel. Los costos viejos que la base dividió entre 1.18 se corrigen ×1.18, con historia.
4. Fuera «tiene RUC ⇒ factura» y la idea de anotar la factura en el proveedor.
5. El precio sugerido es una **sugerencia, nunca un candado**:
   - **No bajes de** (piso): el menor precio en .90 que, con 35 % de rebaja, todavía deja 20 % (≈ lo que pagaste × 2.27).
   - **Sugerido** (techo): el precio de las prendas parecidas (misma categoría, costo ±25 %) que se venden más rápido que la mitad de su
     categoría, según la vara de Frescura. Si la categoría rota rápido, su precio alto; si rota lento, el del medio. Primero la sede que
     recibe y, si no alcanza, todo CAYLA. Nunca menos que el piso. Sin datos: el piso y la IA como segunda opinión.
6. Se redondea a .90 hacia arriba. El precio puede variar por sede.
7. Veredicto: **Pierdes** (al guardar pide confirmar, no prohíbe) · **Aguanta poca rebaja** · **Buen precio** · **Más caro que las parecidas**.
8. La barra **Prenda / SUNAT / Para ti** aparece en Recibir, Nuevo producto, el cambio de precio de Catálogo y al armar una rebaja.
9. Un costo raro (muy distinto al anterior, igual al monto sin impuesto de la orden, o fuera de lo que cuesta su categoría o CAYLA) no
   sugiere precio ni deja guardar hasta que la persona confirma «Sí, pagué S/ X».
10. Si el costo subió al reponer, se avisa y se sugiere el precio nuevo; la integrante decide.
11. Cualquier integrante puede fijar precio. Quien fija precio ve el costo en esa hoja. **El cliente nunca ve el costo**, y una prueba lo vigila.
12. La IA de precio se queda como segunda opinión, siempre dentro del piso y el techo.
13. Las cinco varas de margen del ERP pasan a una sola cuenta.

## Las actividades (cada una con su PR y verificable sola)

| # | Qué cambia para el negocio | Tamaño | SQL | Espera tu OK |
|---|---|---|---|---|
| A0 | ADR, mediciones en producción, nota al contador y preguntas abiertas — **ADR-0668 escrito; faltan las mediciones y la nota al contador** | S | no | sí, del ADR |
| A1 | ~~La cuenta en un solo archivo (`lib/cuenta-de-precio.ts`), sin cambiar ninguna cifra~~ **hecho** | S | no | no |
| A2 | ~~**Una sola cuenta en Recibir y Nuevo producto; fuera «RUC ⇒ factura».**~~ **hecho** (la propuesta de la IA también sube al piso nuevo) | M | no | no |
| A3 | ~~Quien fija precio ve el costo; el cliente nunca (con la prueba que lo vigila)~~ **construido** (rama `claude/precio-a3-costo-a-la-vista`): en la hoja que cambia el precio, no en la tabla de Productos; **SQL pegado en producción el 2026-11-15**. `fn_precio_referencia` pasa a A4 | M | sí | sí |
| A4 | ~~Candados de costo: anterior, sin impuesto y fuera de la categoría; se confirma el **monto**~~ **construido** (rama `claude/precio-a4-candados-de-costo`): dos partes de SQL que **esperan tu OK**, pegadas en orden PARTE 1 → web → PARTE 2 | M/L | sí | sí |
| A5 | «Pierdes» pide confirmar en vez de prohibir; dos personas a la vez no se pisan el precio | M | sí | sí |
| A6 | La pieza única `<CuentaDelPrecio>` (barra, veredicto, piso, IA) en la hoja de Recibir | L | no | sí, la eliges mirando |
| A7 | Recibir: la tabla del cierre y la Vitrina dicen lo mismo que la hoja | M | no | no |
| A8 | Nuevo producto con la misma pieza | M | no | pregunta (c) |
| A9 | Catálogo: cambiar el precio (ficha, en bloque, por sede) | M | no | no |
| A10 | Campañas: «3 pierden · 5 aguantan poca rebaja» al armar una rebaja | M | no | no |
| A11 | **La base guarda el costo con IGV y corrige ×1.18 lo viejo**, en una sola ventana | L | sí | sí, tú y el contador |
| A7b | Reposición: «Pagaste S/ X más que antes» | S | no | no |
| A12 | El techo: «Sugerido» con las parecidas que se venden rápido | L | sí | sí |
| A13 | Catálogo ▸ Productos, Revisar precios y la IA usan el mismo piso | M | sí | sí |
| A14 | Proveedores, Producción, Análisis y el Plan de compra: misma cuenta, su propio umbral | M | no | sí, los umbrales |
| A15 | Cierre: la pieza entra a «Una función, una pieza», limpieza de lo que quede sin uso | S | no | no |

**Orden:** A0 → A1 → A2 → (A11 si el contador ya respondió) → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10 → A11 → A7b → A12 → A13 → A14 → A15.

Por qué este orden:
- **A2 va primero porque hoy muestra cifras equivocadas** y no necesita SQL.
- **A11 espera al contador**, porque cambia cómo el libro cuenta el costo de lo vendido. Mientras la base siga dividiendo entre 1.18, todo
  lo que compara con el costo *guardado* mezcla dos bases. Por eso «Pagaste S/ X más» (A7b) y el techo (A12) van después de A11: antes
  inventarían una subida del 18 % en cada reposición con factura.
- **A11 se publica en una sola ventana** (libro, base, pantalla de corregir costo y la corrección ×1.18), o alguien escribiría un costo con
  la regla vieja en medio.

## Lo que falta decidir (no lo responde el código)

1. **Las prendas del Taller** hoy entran con costo **sin** IGV (`20261015040000_orden_insumo_recepcion_funciones.sql:69,290`). Con «todas
   iguales», ¿su costo se lleva a con IGV o se queda? Si se queda, su piso sale 18 % bajo para siempre.
2. **Al contador:** con el costo con IGV, ¿cómo queda el libro? (i) el inventario por el total y el IGV recuperado contra el costo de
   ventas del mes, o (ii) el libro sigue sin IGV y solo la cifra de gestión usa el costo del papel.
3. ~~**«Precio ≤ costo»:**~~ resuelto en A4 como la maqueta: aviso rojo que no apaga el sugerido; se confirma en «Pierdes» (A5).
4. (c) En Nuevo producto, ¿se puede crear una prenda sin costo?
5. Antes de corregir ×1.18: qué prendas en campaña activa quedarían bajo el costo nuevo (la caja las rechazaría a mitad de campaña).

## Lo que no se hace aquí

- La caja (`registrar_venta`, `venta_descuento_bajo_costo`) sigue comparando como hoy; se revisa aparte.
- Finanzas y los Estados financieros no cambian salvo lo que decida el contador en A11.
- Choques: #1874 (recepción y costo) y #1880 (precio por sede) están abiertos; A0 espera a #1874 y A5 a #1880.

## Después de A4 (anotado al construirlo)

- Quitar el «sí» suelto (`confirma_costo: true` sin monto) para los motivos de antes cuando la web nueva lleve unos días publicada y la cola
  sin conexión de «Llegó mercadería» esté vacía: es la segunda mitad de la corrección 15.
- La matriz «Cambiar por talla» del cierre (`PrendaConCombinaciones`) no repite el aviso del costo dudoso: la fila de arriba ya lo muestra.
- El detalle del rechazo de la base (`costo_vigente`) sigue diciendo lo guardado, no lo de papel: el texto «N veces su costo actual» puede
  quedar 18 % corrido en una prenda con factura hasta A11.
