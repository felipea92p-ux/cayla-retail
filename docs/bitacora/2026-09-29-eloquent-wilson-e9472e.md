## 2026-09-29 (Una base local nueva ya trae patrones: Nuevo producto de Indumentaria deja de trabarse en «Cómo se hace»)

Qué hice: `supabase/seed.sql` ahora siembra los 7 patrones de Felipe (Liso, Rayas, Cuadros, Lunares, Floral, Animal print,
Estampado) y los vincula en `retail.categoria_patrones` a toda Indumentaria activa más Pañuelos y Pañoletas: 19 categorías ×
7 = 133 vínculos, el mismo mapa que la migración `20260918230200` aplica en producción. Antes una base recién levantada
tenía 0 patrones, y en `/productos/nuevo` la familia Indumentaria (que exige tejido Y patrón) mostraba «no tiene patrones
habilitados… No hay valores aprobados todavía» en «Camisas y Blusas» y no dejaba avanzar sin ir a Catálogo ▸ Atributos.

Por qué así: los tejidos sí llegan por migración (`20260918140000_tejidos_seed.sql`), pero los patrones se cargaron a mano en
producción, y el mapa de categorías salta ese eje con un aviso cuando no hay vocabulario; el seed corre DESPUÉS de las
migraciones, así que es el lugar donde cerrar el hueco sin tocar migraciones ya pegadas. `fn_patrones_estado_trigger` deja
`pendiente` cualquier INSERT sin un Líder con sesión (en el seed `auth.uid()` es null), por eso el seed apaga
`patrones_estado_biut` mientras inserta con `estado = 'aprobado'` y `aprobado_en = now()`, y lo vuelve a encender: el mismo
recurso que ya usan los tejidos y las etiquetas. Es idempotente (`on conflict` sobre `patrones_clave_unica`; los vínculos,
sobre su clave primaria) y une por nombre y por familia, no por id. Se sembraron los 7 acordados el 2026-09-18 y no los 5 del
encargo porque el mapa de producción ya nombra esos 7: así local y producción ofrecen lo mismo. La rama vieja
`claude/patrones-seed-retira-colores` (migración `20260918100000`) nunca llegó a `main` y no se reutilizó.

Felipe se lleva: en local, «Nuevo producto» ▸ Indumentaria ▸ Camisas y Blusas muestra los 7 patrones en «Cómo se hace» y el
paso se cierra (probado: Algodón · Liso, aparece «Seguir al precio →»). Ojo: no corrí `supabase db reset` porque la base local
la comparten todas las sesiones y borraría lo que otras tienen sin pegar; probé el bloque del seed contra las tablas vaciadas
dentro de una transacción con ROLLBACK (0 → 7 patrones y 133 vínculos; segunda corrida sin duplicar; disparador otra vez
activo) y después lo apliqué solo a la base local. El piloto de CI (base nueva + `seed.sql`) es quien corre el seed completo.
