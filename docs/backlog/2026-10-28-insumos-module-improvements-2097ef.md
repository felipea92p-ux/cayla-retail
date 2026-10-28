# Backlog · 2026-10-28 · Insumos: una tela con sus colores, en metros (ADR-0554)

**Estado en producción (28-oct):** la PARTE 1 de `20261028175000` está pegada (el conversor devolvió 1). La PARTE 2 y `20261028172000` se confirman con la consulta de solo lectura. La web publicada es la de antes: **la rama no está subida**.

## Felipe (en este orden)
- [ ] **Pegar el respaldo de hoy:** `supabase/migrations/pegar-en-produccion-respaldo-materiales-2026-10-28.sql` (solo agrega filas a `respaldo_purgas.filas`; idempotente). Es lo único con fecha de vencimiento: antes de que alguien edite la tela.
- [ ] **Pegarme el resultado de la consulta de solo lectura** (la del chat; el conector de Supabase me negó el permiso): confirma `20261028172000`, la PARTE 2 y que las 11 funciones son las del repo (md5).
- [ ] **Pegar lo que falte, por separado** (nunca el archivo entero): `20261028172000`; la PARTE 2 de `20261028175000` (desde su `set lock_timeout`).
- [ ] **Pegar `20261028203000`** (una sola pegada) **antes de publicar la web** nueva. Hace posible «Editar tela» y cierra lo que la revisión encontró.
- [ ] **Subir la rama y abrir el PR en borrador con `/abrir-pr`** (producción corre SQL que solo vive en este worktree; la rama está 25 commits atrás de `main`, los choques esperados son `docs/ARQUITECTURA.md`, `docs/SESIONES-ACTIVAS.md`, `package.json` y `scripts/ci/pruebas-postgres.mjs`). Marcar «SQL pegado» solo cuando la consulta salga completa.
- [ ] **Después de publicar la web:** `select * from retail.fn_materializar_insumos_sueltos();` (ensaya) y, si cuadra, `…(true)`.
- [ ] **Mirar el costo del lote de 9 m de `MM-01`:** el error de la coma pudo dejarlo en S/ 0.00 (es dinero).
- [ ] **Decidir una cuestión de permisos** (detalle en el chat del 28-oct; el repo es público y no la documenta).
- [ ] **Decidir G16:** colores en bloque, código generado y compra por rollo para los avíos (hoy solo la tela).
- [ ] **Elegir la cara de «Nueva tela»** (A una hoja / B paso a paso) y confirmar «agregar material» = crear un tejido al vuelo.
- [ ] **Mientras la web vieja siga publicada:** que el Taller no cree insumos nuevos de tela, no use «Editar la ficha» de `MM-01-ARN` y escriba los costos con punto.

## Hecho en la rama
- [x] Investigación, cuatro decisiones de Felipe y maquetas (`docs/investigacion/…`, `docs/maquetas/insumos-nueva-tela-2026-10/`).
- [x] Actividad 0 (candados de unidad, `20261028172000`), 1 (la tela en la base, `20261028175000`) y 2 («Nueva tela» y la lista por tela, cara A).
- [x] **Actividad 3 y la revisión adversarial** (30 hallazgos, 0 refutados): `20261028203000` (`editar_material`, endurecimiento, conversor que ensaya y no aborta), la hoja «Editar tela», las piezas compartidas con «Nueva tela», los costos de céntimos, las cotas del kilo, el respaldo y el deshacer **ensayado** (`pnpm pruebas:materiales` 77 casos, grupo R). Detalle y tabla de hallazgos en el ADR-0554.
- [x] `tema:auditar` de Insumos (7 escenarios, 0 hallazgos en oscuro), `guias:recorrer` (26 pasos), navegador a 375 px y escritorio, aviario (`materiales` es de Gallito).

## Pendiente (cada actividad, con su OK)
- [ ] **Actividad 4:** «Llegó tela» con kilo y rollo → metros, el factor medido por lote (envoltorio de `recibir_insumo`; las otras dos puertas de lotes no cambian). Hasta entonces el saldo en kilos o rollos se convierte con el rinde de la ficha y la nota del lote dice lo que se contó.
- [ ] **Actividad 5:** conexión con Nueva orden y enlaces «Regístralas ahí».
- [ ] **Actividad 6:** cierre con `/formidable` (una persona sin contexto), `/chaos` formal sobre las pantallas que guardan, `tema:auditar` a 375 px y guías.
- [ ] **Después de pegar en producción:** refrescar el volcado (`pnpm datos:generar:produccion`, `pnpm datos:comparar`) y los tipos: el diccionario de datos todavía no trae `materiales`. Mientras tanto el aviario solo avisa «en el aviario, pero no en el volcado».
- [ ] **Archivar una tela o un color** (un color con saldo no se archiva): no existe todavía.
- [ ] **Otra decisión, de dinero y fuera de este trabajo:** qué hace el sistema cuando una orden pasa al stock sin tela anotada (bloquear, marcar «costo sin medir», o restaurar al revertir). Hoy solo avisa (ADR-0510) y el costo promedio se envenena (OP-343: S/ 4,50 en vez de S/ 22,38 en la prueba local).
- [ ] **Medir en la pila Supabase** si `drop function … cascade` y `drop table` de la PARTE B del deshacer toman los candados de `auth` y `storage` (la base local no trae sus disparadores de eventos).
- [ ] **Limpieza que no se hizo:** ~10 `replace(",", ".")` sueltos en `lib/` frente a la regla única de plata (`monto-plata-reglas.ts`); `InsumoModales.tsx` sigue en la deuda de `sugerir-archivos.ts`; «Ingresar insumo» abre con el primer insumo A–Z ya elegido (se arregla en la actividad 4); `v_insumo_saldos` sin `security_invoker` (ADR-0090); un color que se renombra en Catálogo deja el nombre copiado del insumo hasta que alguien edite la tela.
