## Dañadas: corregir y «Se arregló» (ADR-0640) — 2026-11-10

- [ ] **Pegar en producción** `20261110172000_danadas_corregir_la_prenda.sql` y después `20261110173000_danadas_no_estaba_danada.sql`, antes de publicar la web (con el OK de Felipe).
- [ ] **Arreglar el Vestido Campanita de Trujillo** cuando la web esté publicada: «Me equivoqué de prenda» sobre la dañada (28 → 30, desde el almacén) y un «Ajustar stock» que deje la 28 del almacén en 0. Hoy el sistema cuenta 3 donde hay 2.
- [ ] `/chaos` sobre la lista de Dañadas (los dos botones nuevos): en la base ya se probó doble envío, marca reusada, sin alcance, apartado, sin módulo y lo ya resuelto; falta la pasada del navegador.
- [ ] `guias:recorrer` de Existencias con una talla que tenga dañada (el paso «Volvió arreglada» es opcional y no se recorrió).
- [ ] La tarjeta de la lista de Existencias sigue diciendo «acabó» en una talla cuya única prenda está dañada (la ficha ya dice «Dañada»).
