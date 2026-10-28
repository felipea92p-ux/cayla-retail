# Capturas del ERP para la guía «Vender una blusa con boleta y Yape»

HTML y CSS **reales** de cada estado de pantalla del ERP, capturados el 2026-09-30 contra `main` 63bcc538, con datos inventados (más los datos públicos del emisor que ya salen impresos en cada boleta). Con ellas `node scripts/flujo-de-negocio/guia/generar-guia.mjs venta/boleta-sin-dni-yape` regenera el HTML **sin levantar el ERP**.

- Solo están las que la guía usa (24 estados, el CSS, las 2 tipografías y los atributos del documento).
- Se vuelven viejas cuando cambia una pantalla de `main`: recapturar con `scripts/flujo-de-negocio/guia/CAPTURAR.md` y volver a correr con `--guardar-capturas`. Cada recaptura suma ~2 MB al historial del repo: no se rehace sin un cambio de pantalla que lo justifique.
- Los respaldos de la base de datos **no** van al repo (son datos de la base local).
