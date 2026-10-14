## Plan de campaña: historial y propuestas (2026-10-12, ADR-0372, C1–C6; plan aprobado por Felipe)

- [x] **C1** Lista de campañas por año y momento, con buscador; abre la que toca hoy (solo web). La lista de un desplegable de cabecera ya no se corta.
- [x] **C2** `retail.ventas_historicas` + `fn_historial_ventas` (migración `20261012160000`) + `scripts/plan-compra/sinatra-a-sql.py`. En local: 3 085 días
  de Trujillo cargados (Arequipa se salta: la base local no tiene esa tienda).
- [x] **C3** Pestaña «Historial» por año (`/compras/plan/historial`).
- [x] **C4** «Proponer los tres» (flojo · normal · bueno) desde `fn_plan_compra_propuesta` (migración `20261012161000`) y `lib/plan-compra-propuesta.ts`.
- [x] **C5** «Lo que sobra» de CAYLA por campaña (`guardar_plan_compra_recupero`, solo líder; hereda de la anterior).
- [x] **C6** Pestaña «Resultados» (`/compras/plan/resultados`, `fn_plan_compra_resultados`).
- [x] **Migraciones `20261012160000` y `20261012161000` EN PRODUCCIÓN (2026-10-12)**, verificadas como líder. B5 (#964) ya estaba fusionado.
- [x] **La carga de Sinatra EN PRODUCCIÓN** (3 901 días: Trujillo desde 2017-09, Arequipa desde 2024-02; se genera con
  `python3 scripts/plan-compra/sinatra-a-sql.py "<SINATRAS>" <fuera-del-repo>.sql`). Migración `20261012162000` (tiendas activas) también.
- [x] **Reparto por tienda** (Felipe: «de manera global debemos comprar tanto, pero cada sede es única»): por lo vendido en 90 días, todo al
  inicio, con el mínimo que fija un líder (`planes_compra_reparto`, `guardar_plan_compra_minimo`; migración `20261012164000`).
- [x] **Resumen del Plan y «¿Cómo va?» compactos**: el resumen es una fila de cifras (se mide la tarjeta, no la ventana); «¿Cómo va?» es la
  primera tarjeta de Resultados con la curva a un toque.
- [x] **Buscar y ordenar** en Historial y Resultados; en Resultados toda fila abre su detalle: contra lo esperado (toda CAYLA) y contra la
  misma campaña del año anterior (por categoría, sale de `fn_plan_compra_propuesta`; sin dato lo dice: Sinatra no tiene categorías).
- [x] **`20261012164000_plan_compra_reparto_por_tienda.sql` EN PRODUCCIÓN (2026-10-12)**, verificada como líder.
- [ ] **Categorías que se rehacen entre campañas**: la comparación con el año anterior es por `categoria_id`; si un líder junta o vuelve a crear
  una, el año siguiente dirá «0» en vez de «sin dato».
- [x] **Publicar la web:** PR #977 fusionado (2026-10-12); lo de después, en su PR de seguimiento.
- [ ] **Lima: fijar su mínimo** en la primera campaña real, antes de pedir la compra (sin él, el reparto le da casi nada).
- [x] **Lo rescatado de los referentes** (maqueta `docs/maquetas/plan-campana-ubicacion-2026-10/`): en el Plan, el simulador y «Te quedan S/ X para comprar»;
  en Resultados durante la campaña, «¿Cómo va?» y «Pedir más o impulsar»; al terminar, el cierre con sell-through. Lo que ya hace Análisis (la prenda
  exacta que se acaba o no se vende, qué pedir) no se repite: un acceso, solo para quien ve ese módulo.
- [x] **`20261012163000_plan_compra_resultados_en_curso_y_cierre.sql` EN PRODUCCIÓN (2026-10-12)**, verificada como líder.
- [ ] **Ligar las órdenes de compra al plan** para que «Te quedan» descuente lo ya comprometido (hoy resta solo la inversión planificada).
- [ ] **/formidable y /chaos** de «Lo que sobra» (la hoja nueva que guarda) y de las pestañas nuevas (solo leen: /chaos no aplica).
- [ ] **Lima 2026 en Sinatra:** su archivo solo tiene 20 registros de «Ingresos»; si existe un diario de Lima, sumarlo a `FUENTES` del script.
- [ ] **El formulario de una categoría dice «diciembre»** en sus títulos («¿Cuántas venderías en diciembre?») aunque la campaña sea otra: cambiarlo por el
  nombre de la campaña.
- [ ] **«Diciembre 2026» y «Navidad 2026» se superponen**: en diciembre las dos están «En curso»; decidir si Navidad es parte de Diciembre.
- [ ] **Refrescar el volcado de producción** cuando entren las migraciones (`ventas_historicas`, `recupero_defecto_pct` y las funciones nuevas).
- [x] **`20261012212000_plan_compra_resultados_por_tienda.sql` EN PRODUCCIÓN (2026-10-12)**, verificada como líder: «¿Cómo va?» y «Pedir más» de una
  tienda.
- [x] **`20261012223000_plan_compra_precio_lleno_al_vender.sql` y `20261012224000_plan_compra_lo_pedido_en_ordenes.sql` EN PRODUCCIÓN (2026-10-12)**,
  verificadas como líder.
- [ ] **Que lo pedido reste de «Comprar»** cuando Órdenes de compra reciba contra la orden (su fase 4, ADR-0362): hoy solo se muestra.
- [ ] **Dos campañas que se pisan** (Diciembre y Navidad) muestran la misma orden en las dos: decidir si una orden puede ser de una sola.
- [x] **Años de Historial en UNA fila** (Felipe 2026-10-12, maqueta `docs/maquetas/plan-historial-anios-2026-10/`, opción 2): los que caben, seguidos y con el
  elegido al medio; el resto en «Más años», por década y con buscador (`ventanaDeAnios`, `aniosQueCaben`).
- [x] **Plan en el celular:** resumen, campaña y Exportar en una fila (la campaña se corta con «…»); filtros en una fila que se desliza; los dos combos lado a lado.
- [x] **Resultados e Historial arrancan en la sede de la cabecera** (Felipe 2026-10-12): Resultados la elige de entrada; Historial la pone primera y marcada, y su
  detalle abre en ella. En CAYLA Global o en el Taller, toda CAYLA (`tiendaDeLaCabecera`, `laDeLaCabeceraPrimero`).
- [x] **El selector es el calendario de Etiquetas; un plan por campaña y por año; «Campaña nueva» queda en Etiquetas con su formato** (ADR-0372 act. f,
  migración `20261012234000`). **EN PRODUCCIÓN (2026-10-13)**: la pegó Felipe; verificada por lectura y como líder.
- [ ] **Etiquetas no tiene cómo crear una campaña** (toda etiqueta nueva nace en «General»): hoy solo se puede desde el Plan. Que Etiquetas use
  `crear_campana_con_plan` (o una hermana sin plan) para su propio «Nueva campaña».
- [ ] **El selector crece 12 campañas por año que viene**: si molesta, mostrar «Por venir · 2027» plegado hasta que falten 6 meses.
