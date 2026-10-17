## 2026-10-17 (La tienda mide cuánto tarda en el celular de los clientes reales, ADR-0447)
Qué hice: la tienda ya mide a sus clientes. En 1 de cada 2 visitas, con un archivo que solo baja esa mitad, junta cuándo se ve lo principal,
cuánto tarda en responder a un toque y cuánto salta la página (las métricas de Google), y del toque en un enlace a lo primero que cambia y a
la página. Lo manda en un solo envío al cambiar de app, a `/api/medicion`, que escribe una línea en el registro de Vercel y nada más: ni
base ni sesión, y la página va sin sus ids. `pnpm --filter tienda medicion:leer` baja el día, lo guarda fuera de git y resume 7 días.
Por qué así: Felipe eligió la medición propia (gratis) sobre Speed Insights ($10/mes), porque Speed Insights no mide el toque y la pregunta
abierta de ADR-0445 es justo esa. El registro del plan Pro guarda un día: por eso el lector guarda lo que baja. Un toque que no llega en 20
s cuenta como 20 s y uno que se toca dos veces se mide desde el primero, para no hacer ver los peores casos mejores de lo que son.
Felipe se lleva: con `medicion:leer` una vez al día (CLI de Vercel 64 o más nueva), en 2 semanas la tabla dice si hace falta el esqueleto
inmediato de la lista a la ficha (p75 del toque sobre 200 ms con 30 toques o más); cómo leerla está en
`docs/backlog/2026-10-17-distracted-vaughan-22269f.md`.
