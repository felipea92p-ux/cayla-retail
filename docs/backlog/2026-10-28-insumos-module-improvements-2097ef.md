# Backlog · 2026-10-28 · Insumos: una tela con sus colores, en metros (ADR-0554)

**Estado en producción (28-oct, confirmado con la sonda de solo lectura que corrió Felipe):** `20261028175000` está pegada entera (PARTE 1 y PARTE 2; el conversor devolvió 1 y esa tela ya tiene tejido) y el respaldo `estado-tras-conversion-2026-10-28` también. **`20261028172000` NO está** y `20261028203000` tampoco. La web publicada es la de antes: la rama se sube con PR en borrador (`/abrir-pr`).

## Felipe (en este orden)
- [ ] **Revisar el PR en borrador** y dejarlo listo: producción ya corre SQL que antes solo vivía en un worktree.
- [ ] **Pegar `20261028172000` entera, en una sola pegada** (se detiene y dice qué corregir si hay una tela en otra unidad o códigos repetidos). Después, la sonda corta (en el ADR-0554, «Orden de entrega») debe dar `2 | t | t | t | t | 1 | 1 | 1 | 0`.
- [ ] **Pegar `20261028203000` entera, en una sola pegada, antes de publicar la web** nueva (necesita la anterior: si falta se detiene con «Primero pega 20261028172000»). Hace posible «Editar tela» y cierra lo que encontraron las dos revisiones. **Nunca repegar `20261028175000` después de ésta.**
- [ ] **Publicar la web** (fusionar el PR) y marcar «SQL pegado» solo cuando la sonda salga completa.
- [ ] **Correr el conversor:** `select * from retail.fn_materializar_insumos_sueltos();` (ensaya) y, si cuadra, `…(true)`.
- [ ] **Mirar el costo del lote de 9 m de `MM-01`:** el error de la coma pudo dejarlo en S/ 0.00 (es dinero).
- [ ] **Decidir una cuestión de permisos** (detalle en el chat del 28-oct; el repo es público y no la documenta).
- [ ] **Decidir G16:** colores en bloque, código generado y compra por rollo para los avíos (hoy solo la tela).
- [ ] **Elegir la cara de «Nueva tela»** (A una hoja / B paso a paso) y confirmar «agregar material» = crear un tejido al vuelo.
- [ ] **Decidir si la merma editada recalcula las órdenes abiertas:** hoy la hoja avisa que no (el plan de las ya abiertas se queda con la merma con que se calculó).
- [ ] **Mientras la web vieja siga publicada:** que el Taller no cree insumos nuevos de tela y escriba los costos con punto. «Editar la ficha» de `MM-01-ARN` sirve para el color; solo cambiar su tejido se rechaza.
- El script de **deshacer** no se pega salvo que decidas volver atrás (es el camino de vuelta, ensayado con y sin `20261028203000`).

## Hecho en la rama
- [x] Investigación, cuatro decisiones de Felipe y maquetas (`docs/investigacion/…`, `docs/maquetas/insumos-nueva-tela-2026-10/`).
- [x] Actividad 0 (candados de unidad, `20261028172000`), 1 (la tela en la base, `20261028175000`, ya en producción) y 2 («Nueva tela» y la lista por tela, cara A).
- [x] **Actividad 3 y las dos revisiones adversariales** (30 + 28 hallazgos confirmados): `20261028203000` (`editar_material` con control de versión, endurecimiento, conversor que ensaya, deja su respaldo y no aborta), la hoja «Editar tela» (choque de versión con «Recargar», nombres de color desfasados, avisos de lo que un cambio no hace), las piezas compartidas con «Nueva tela», los costos de céntimos, las cotas del kilo, el respaldo y el deshacer **ensayado** (`pnpm pruebas:materiales` 98 casos, grupo R). Detalle y tabla de hallazgos en el ADR-0554.
- [x] `tema:auditar` de Insumos (7 escenarios, 0 hallazgos en oscuro), `guias:recorrer`, recorrido real de «Editar tela» en el navegador (20 comprobaciones), aviario (`materiales` es de Gallito) e **INV-23** de `/chaos` (cada color es el reflejo de su tela).

## Pendiente (cada actividad, con su OK)
- [ ] **Actividad 4:** «Llegó tela» con kilo y rollo → metros, el factor medido por lote (envoltorio de `recibir_insumo`; las otras dos puertas de lotes no cambian). Hasta entonces el saldo en kilos o rollos se convierte con el rinde de la ficha y la nota del lote dice lo que se contó.
- [ ] **Actividad 5:** conexión con Nueva orden y enlaces «Regístralas ahí».
- [ ] **Actividad 6:** cierre con `/formidable` (una persona sin contexto), `/chaos` formal sobre las hojas que guardan (hoy figuran «sin atacar» en `docs/chaos/README.md`), `tema:auditar` a 375 px y guías.
- [ ] **Después de pegar en producción:** refrescar el volcado (`pnpm datos:generar:produccion`, `pnpm datos:comparar`) y los tipos: el diccionario de datos todavía no trae `materiales`. Mientras tanto el aviario solo avisa «en el aviario, pero no en el volcado».
- [ ] **Archivar una tela o un color** (un color con saldo no se archiva): no existe todavía.
- [ ] **Otra decisión, de dinero y fuera de este trabajo:** qué hace el sistema cuando una orden pasa al stock sin tela anotada (bloquear, marcar «costo sin medir», o restaurar al revertir). Hoy solo avisa (ADR-0510) y el costo promedio se envenena (OP-343: S/ 4,50 en vez de S/ 22,38 en la prueba local).
- [ ] **Medir en la pila Supabase** si `drop function … cascade` y `drop table` de la PARTE B del deshacer toman los candados de `auth` y `storage` (la base local no trae sus disparadores de eventos).
- [ ] **Limpieza que no se hizo:** ~10 `replace(",", ".")` sueltos en `lib/` frente a la regla única de plata (`monto-plata-reglas.ts`); `InsumoModales.tsx` sigue en la deuda de `sugerir-archivos.ts`; «Ingresar insumo» abre con el primer insumo A–Z ya elegido (se arregla en la actividad 4); `v_insumo_saldos` sin `security_invoker` (ADR-0090); un color que se renombra en Catálogo deja el nombre copiado del insumo hasta que alguien guarde la tela (la hoja «Editar tela» ya lo avisa y lo pone al día; no se tocó el núcleo de Catálogo).
