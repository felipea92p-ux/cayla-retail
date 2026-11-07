# 2026-11-07 — Lo que falta en un conteo no siempre es merma (ADR-0617)

- El diario dejaba como merma la prenda cruzada (falta una talla y sobra otra del mismo modelo, el mismo día) y la vendida sin registrar (la venta sin prenda ya había sacado su costo y el conteo lo sacaba otra vez).
- Migración `20261107001000_conteo_cruces_y_vendidas_sin_registrar.sql`: `fn_conteo_explicado` empareja; `fn_asientos` deja de asentarlas como merma o sobrante y asienta solo la diferencia de costo; la comprobación de la 201 lo sabe. **No está en producción.**
- Medido en noviembre (lectura): AQP +S/ 253, TRU +S/ 23 al resultado; 22 unidades cruzadas entre las tres tiendas.
