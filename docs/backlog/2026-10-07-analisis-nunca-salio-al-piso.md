## 📊 Análisis: «Nunca salió al piso», «¿Qué pedir?» contra Navidad y el ritmo con los días que hay (2026-10-07, ADR-0357 decisión 11) — rama `claude/analisis-nunca-salio-al-piso`

- [x] Migración `20261007120000_analisis_salio_al_piso.sql`: `salio_al_piso`, `llego` y los días desde el piso en `fn_analisis_sede`.
      **EN PRODUCCIÓN** (Felipe la pegó el 2026-10-07; verificado: huella del cuerpo `874919d9dfc5820ec59c2cc1ec70318d`, una sola firma).
      Prueba contra Postgres 25/25.
- [x] Pestaña «Nunca salió al piso» y su tarjeta en Hoy (A1); «Bájalas al piso» por tipo y «Bajar» por prenda.
- [x] «No se vende» desde el piso (C): carril «Días en el piso sin venderse», aviso que lleva a la pestaña nueva, ficha con «Bajar al piso».
- [x] El ritmo con los días de ventas de la tienda (hasta 30) en «Se está acabando», Hoy, la ficha y «Qué pedir».
- [x] «¿Qué pedir?» contra Navidad (B2) en Hoy y en la pestaña; tallas en unidades; ranking con sus días.
- [x] Felipe pegó la migración (2026-10-07) y la huella coincide.
- [ ] Refrescar el volcado de producción para que el diccionario tenga los campos nuevos (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] Decidir contra qué se mide «¿Qué pedir?» pasada la Navidad (la próxima campaña del Plan de campaña o un horizonte fijo).
- [ ] Quitar `llegaron_30` y `vendidas_de_llegadas_30` de `fn_analisis_sede` cuando la web vieja ya no los lea.
- [ ] Ver «Nunca salió al piso» con una encargada real (el orden por tipo, «Bájalas al piso» con 70 prendas de una vez).
- [ ] `/formidable` y `/chaos` de Análisis (pendientes desde el 2026-10-06).
- [ ] La píldora de las pestañas queda corrida en la primera carga sin la fuente en caché (`IndicadorDeslizante`, tarea aparte).
