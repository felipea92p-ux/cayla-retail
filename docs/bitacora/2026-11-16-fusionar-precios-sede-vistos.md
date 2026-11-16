# 2026-11-16 · Fusionar: lo que se ve es lo que se cobra (ADR-0650, act. 2026-11-16 b)

- **Qué:** auditoría adversarial de la fusión con precios por sede. La fusión frena (PT409) si un precio de tienda cambió desde la vista
  previa; la vista previa avisa el precio que quedaría bajo el costo; «la prenda a S/ X»; y el aviso de error ya no repite ni afirma lo
  que no sabe. Migración `20261116203000`, `PreciosPorSede.tsx`, `FusionarProductosHoja.tsx`, `fusionar-productos-reglas.ts`.
- **Verificado:** base local con las 1215 migraciones: `pruebas:fusionar-productos` 54/54 (5 nuevos) y las suites de precios de tienda,
  terminal, pérdidas, eliminar producto, recepción, tienda web y catálogo; la migración se repega sin efecto. Navegador: el aviso de costo
  aparece y se va con «un solo precio»; con la hoja abierta, un precio de Trujillo cambiado en la base hace que «Sí, fusionar» frene, no
  escriba nada y la hoja se recargue con S/ 95. `tsc`, `eslint` y 309 pruebas de la web en verde. **No verificado:** producción (el
  conector de Supabase niega el permiso).
- **Riesgo:** la web funciona con la base de antes (la clave nueva se ignora y no hay avisos de costo); el freno solo llega al pegar el SQL.
