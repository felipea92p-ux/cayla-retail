## Catálogo · Productos — lo que quedó de esta ronda (2026-09-29, ADR-0281, rama `claude/catalog-screens-review-88ca6b`)

- [x] **`20260929180000_productos_orden_recientes_y_vendidos.sql` pegada en producción por Felipe el 2026-09-29, antes de fusionar la
      web.** Verificada de solo lectura ese mismo día: `md5(prosrc)` de `fn_productos` = `3534a61a8aea1327c30b3c8bd1adeefa` (el esperado,
      largo 11399, `parchada = true`, una sola sobrecarga, sigue `security definer` y con permiso para `authenticated`) y los siete
      órdenes responden con los mismos 8 productos (recientes y antiguos, inversos; «vendidos» pone primero al único con ventas).
      **Ojo con el número:** la rama de las notas de crédito ya usa `20260929170000`; esta es `180000`.
- [ ] Felipe: ¿«más comprados» era «más vendidos» (lo que compran las clientas) o lo que la empresa le compra a sus proveedores?
- [ ] Ver una etiqueta impresa en la Brother con la marca: se midió en pantalla (a tamaño real) pero no en papel; el trazo de
      2 mm en peso 800 debería salir, pero es la primera vez que ese texto va en la térmica.
- [ ] La marca no está en la **Vista rápida** de la Grilla ni en la ficha de variantes de la Tabla (sí en la tarjeta y en la Tabla).
- [ ] Las tareas del análisis (`docs/pantallas/catalogo-plan-de-ataque.md`): Ola 0 antes del censo de TRU (marca «Por
      identificar», restos de prueba, candado de precio 0) sigue sin hacerse.
- [ ] La rama va 26 commits detrás de `main` y hay PR abiertos sobre los mismos archivos (#611 `VariantesFicha`/`ProductoForm`,
      #590 `ProductosGrilla`): merge con `main` antes del PR y revisar esos dos.
