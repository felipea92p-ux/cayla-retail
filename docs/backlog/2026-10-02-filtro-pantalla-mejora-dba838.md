## 🔎 Barra de filtros de Productos (2026-10-02, ADR-0308) — tanda 1 solo web; rama `claude/filtro-pantalla-mejora-dba838`

Análisis: `docs/pantallas/productos-filtros.md` (12 tareas). Decisiones de Felipe en 19 preguntas del 2026-10-02.

**Tanda 1 (sin migración)**
- [x] #1 El estado del filtro sigue a la URL (cajas que siguen a la URL, clic dentro de 350 ms, «Limpiar» deja la Tabla, Atrás). Navegador + pruebas.
- [x] #2 Píldora con nombre en la pieza compartida: Productos, Compras, Por pagar, Historial (su «Tienda» ya no se ve elegida sola), Comprobantes, «A quién pedirle». Comprobantes y «A quién pedirle» no se vieron en el navegador (la base local no tiene comprobantes del mes ni reposición).
- [x] #3 Precio con cajas Desde/Hasta y control con límites reales (provisorios: `getPreciosExtremos`).
- [x] #7 Un solo «Ordenar por», conteo arriba, «Más recientes» por defecto.
- [x] #9 Panel abierto en la computadora (cookie), filas «Prenda / Gestión», hoja en el celular; sin desborde de 375 a 1920 px.
- [x] #11 (web) Atajo «/». #12 «Activos» por defecto y «Copiar enlace».

**Tanda 2 (migraciones: Felipe las pega ANTES de fusionar su PR)**
- [ ] #4 Precio y color sin variantes desactivadas (función de listado nueva al lado de `fn_productos`).
- [ ] #5 Facetas: conteo por opción, sin opciones vacías, tramos de precio; reemplaza `getPreciosExtremos`.
- [ ] #6 Disponibilidad en la sede y en la red.
- [ ] #8 Talla y Color con varias opciones; color por familia.
- [ ] #10 Temporada y «Por completar».
- [ ] #11 (base) Buscador sin tildes, por categoría y color, `%`/`_` literales.
- [ ] Limpieza posterior: borrar `fn_productos`/`fn_productos_resumen` viejas cuando nada las llame.
