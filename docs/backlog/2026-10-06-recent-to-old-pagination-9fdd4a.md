## 🗂️ Ventas sin registrar: buscador, orden por columna, páginas y «Responsable» al regularizar (2026-10-06) — rama `claude/recent-to-old-pagination-9fdd4a`

**POR PEGAR en producción (2026-10-06) — lo pega Felipe, DESPUÉS de fusionar el PR (publica la web) y de que Vercel termine:** `supabase/migrations/20261006200000_regularizar_prenda_pide_responsable.sql` (una sola parte: `delete from retail.acciones_sin_responsable where clave = 'regularizar_prenda'`). Pegarla ANTES rompería la web de hoy: manda `x-responsable-omitido: regularizar_prenda` sin responsable y, sin la clave en la lista, la base la rechaza («Elige quién hace esta operación») en cada terminal. Verificación: `select count(*) from retail.acciones_sin_responsable where clave = 'regularizar_prenda';` debe dar 0. Para volver: el `insert` que trae la cabecera de la migración.

- [x] Lista de Ventas sin registrar: de la más reciente a la más antigua, 25 por página, buscador local y encabezados que ordenan (Prenda, Vendió, Cobrado, Estado). Verificado en local con 34 ventas de ejemplo (ya borradas).
- [x] «Regularizar» vuelve a pedir «Responsable» (en la terminal, la colaboradora de turno elige su nombre).
- [ ] Probar el combo con una colaboradora en una terminal (con la cuenta de admin solo se ve el aviso «no necesitas autorización»).
- [ ] Una venta vencida puede quedar en la página 3 con el orden nuevo: decidir si hace falta un filtro o chip «Vencidas». Las cifras de arriba siguen contando todas.
- [ ] Ordenar por colaboradora: hoy «Vendió» ordena por fecha; la colaboradora se filtra con el combo.
