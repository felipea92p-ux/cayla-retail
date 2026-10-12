## Plan de campaña: historial y propuestas (2026-10-12, ADR-0372, C1–C6; plan aprobado por Felipe)

- [x] **C1** Lista de campañas por año y momento, con buscador; abre la que toca hoy (solo web). La lista de un desplegable de cabecera ya no se corta.
- [x] **C2** `retail.ventas_historicas` + `fn_historial_ventas` (migración `20261012160000`) + `scripts/plan-compra/sinatra-a-sql.py`. En local: 3 085 días
  de Trujillo cargados (Arequipa se salta: la base local no tiene esa tienda).
- [x] **C3** Pestaña «Historial» por año (`/compras/plan/historial`).
- [x] **C4** «Proponer los tres» (flojo · normal · bueno) desde `fn_plan_compra_propuesta` (migración `20261012161000`) y `lib/plan-compra-propuesta.ts`.
- [x] **C5** «Lo que sobra» de CAYLA por campaña (`guardar_plan_compra_recupero`, solo líder; hereda de la anterior).
- [x] **C6** Pestaña «Resultados» (`/compras/plan/resultados`, `fn_plan_compra_resultados`).
- [x] **Migraciones `20261012160000` y `20261012161000` EN PRODUCCIÓN (2026-10-12)**, verificadas como líder. B5 (#964) ya estaba fusionado.
- [ ] **POR PEGAR: la carga de Sinatra** (`carga-sinatra.sql`, 3 901 días; se genera con `python3 scripts/plan-compra/sinatra-a-sql.py "<SINATRAS>" <fuera-del-repo>.sql`).
  Hasta entonces el Historial de producción solo muestra lo del ERP (desde el 30-09-2026).
- [ ] **Publicar la web:** fusionar el PR #977.
- [x] **Lo rescatado de los referentes** (maqueta `docs/maquetas/plan-campana-ubicacion-2026-10/`): en el Plan, el simulador y «Te quedan S/ X para comprar»;
  en Resultados durante la campaña, «¿Cómo va?» y «Pedir más o impulsar»; al terminar, el cierre con sell-through. Lo que ya hace Análisis (la prenda
  exacta que se acaba o no se vende, qué pedir) no se repite: un acceso, solo para quien ve ese módulo.
- [ ] **POR PEGAR en producción: `20261012163000_plan_compra_resultados_en_curso_y_cierre.sql`** (reemplazos anclados en `fn_plan_compra_resultados`:
  `por_dia`, `filas[].rebajadas` y `stock`). Sin ella la web se degrada: «¿Cómo va?» sin curva y sin «Pedir más» ni cierre.
- [ ] **Ligar las órdenes de compra al plan** para que «Te quedan» descuente lo ya comprometido (hoy resta solo la inversión planificada).
- [ ] **/formidable y /chaos** de «Lo que sobra» (la hoja nueva que guarda) y de las pestañas nuevas (solo leen: /chaos no aplica).
- [ ] **Lima 2026 en Sinatra:** su archivo solo tiene 20 registros de «Ingresos»; si existe un diario de Lima, sumarlo a `FUENTES` del script.
- [ ] **El formulario de una categoría dice «diciembre»** en sus títulos («¿Cuántas venderías en diciembre?») aunque la campaña sea otra: cambiarlo por el
  nombre de la campaña.
- [ ] **«Diciembre 2026» y «Navidad 2026» se superponen**: en diciembre las dos están «En curso»; decidir si Navidad es parte de Diciembre.
- [ ] **Refrescar el volcado de producción** cuando entren las migraciones (`ventas_historicas`, `recupero_defecto_pct` y las funciones nuevas).
