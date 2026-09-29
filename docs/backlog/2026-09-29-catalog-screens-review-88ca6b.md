## Catálogo · Productos — lo que quedó de esta ronda (2026-09-29, ADR-0281, rama `claude/catalog-screens-review-88ca6b`)

- [ ] **Pegar `20260929180000_productos_orden_recientes_y_vendidos.sql` en producción, ANTES de fusionar la web.** Solo
      `create or replace function` (parche por ancla sobre `fn_productos`; las 8 anclas aparecen exactamente una vez en la función
      viva, verificado el 2026-09-29). Verificar después: `select position('20260929180000' in prosrc) > 0 from pg_proc where
      proname = 'fn_productos'`. **Ojo con el número:** la rama de las notas de crédito ya usa `20260929170000`; esta es `180000`.
- [ ] Felipe: ¿«más comprados» era «más vendidos» (lo que compran las clientas) o lo que la empresa le compra a sus proveedores?
- [ ] Ver una etiqueta impresa en la Brother con la marca: se midió en pantalla (a tamaño real) pero no en papel; el trazo de
      2 mm en peso 800 debería salir, pero es la primera vez que ese texto va en la térmica.
- [ ] La marca no está en la **Vista rápida** de la Grilla ni en la ficha de variantes de la Tabla (sí en la tarjeta y en la Tabla).
- [ ] Las tareas del análisis (`docs/pantallas/catalogo-plan-de-ataque.md`): Ola 0 antes del censo de TRU (marca «Por
      identificar», restos de prueba, candado de precio 0) sigue sin hacerse.
- [ ] La rama va 26 commits detrás de `main` y hay PR abiertos sobre los mismos archivos (#611 `VariantesFicha`/`ProductoForm`,
      #590 `ProductosGrilla`): merge con `main` antes del PR y revisar esos dos.
