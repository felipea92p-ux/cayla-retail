## 2026-10-12 — Plan de campaña: lista por año, Sinatra, Historial, propuesta, lo que sobra y Resultados (ADR-0372, C1–C6)

- **Hecho en local (sin producción):** C1 selector por año y momento con buscador y la campaña de hoy por defecto; C2 la historia de Sinatra en
  `ventas_historicas` (solo soles por tienda y día; KIDS, Sodalita, PET y Lima fuera, con su porqué en el script); C3 Historial por año con «×N un día
  normal» y crecimiento; C4 «Proponer los tres» con las reglas de Felipe (×3 sin historia; punto medio con la campaña anterior; sin promediar si se
  agotó); C5 «Lo que sobra» de CAYLA por campaña; C6 Resultados por tienda, categoría, prenda y color. Verificado: reglas 161, SQL 10/10, navegador.
- **Por qué así:** Sinatra solo sabe soles por tienda, así que el Historial habla en soles y la propuesta por categoría sale del ERP; una sola
  definición de «lo vendido» (`fn_unidades_vendidas`) y una sola vara de «día normal» (60 días antes) para Historial, propuesta y Resultados.
- **Qué falta:** el OK de Felipe para las dos migraciones y la carga de Sinatra en producción; fusionar antes el PR de B5.
