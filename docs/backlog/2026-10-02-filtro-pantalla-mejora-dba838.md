## 🔎 Barra de filtros de Productos (2026-10-02, ADR-0308) — tanda 1 solo web; rama `claude/filtro-pantalla-mejora-dba838`

Análisis: `docs/pantallas/productos-filtros.md` (12 tareas). Decisiones de Felipe en 19 preguntas del 2026-10-02.

**Tanda 1 (sin migración)**
- [x] #1 El estado del filtro sigue a la URL (cajas que siguen a la URL, clic dentro de 350 ms, «Limpiar» deja la Tabla, Atrás). Navegador + pruebas.
- [x] #2 Píldora con nombre en la pieza compartida: Productos, Compras, Por pagar, Historial (su «Tienda» ya no se ve elegida sola), Comprobantes, «A quién pedirle». «A quién pedirle» no se vio en el navegador (ni la base local ni la propia tienen productos por reponer: sin ventas de 30 días).
- [x] #3 Precio con cajas Desde/Hasta y control con límites reales (provisorios: `getPreciosExtremos`).
- [x] #7 Un solo «Ordenar por», conteo arriba, «Más recientes» por defecto.
- [x] #9 Panel abierto en la computadora (cookie), filas «Prenda / Gestión», hoja en el celular; sin desborde de 375 a 1920 px.
- [x] #11 (web) Atajo «/». #12 «Activos» por defecto y «Copiar enlace».
- [x] Revisión adversaria (10 agentes): 6 defectos confirmados + 5 menores, corregidos y reproducidos en el navegador (espacio entre palabras, navegación descartada, URL pedida, lista fuera de la ventana, «A quién pedirle» → «Pedir a», página fuera de rango).

**Tanda 2 (rama `claude/filtro-productos-tanda2`; migraciones POR PEGAR: Felipe las pega ANTES de fusionar su PR)**
- [x] #4 Precio y color sin variantes desactivadas, y la regla «la misma variante» (`fn_productos_listado`).
- [x] #5 Facetas: conteo por opción, sin opciones vacías, tramos de precio (`fn_productos_facetas`); reemplaza `getPreciosExtremos` y el resumen viejo en esta pantalla.
- [x] #6 Disponibilidad en la sede y en la red.
- [x] #8 Talla y Color con varias opciones; color por familia.
- [x] #10 Temporada y «Por completar».
- [x] #11 (base) Buscador sin tildes, por categoría y color, símbolos literales.
- [x] Revisión adversaria de la tanda 2: el buscador corría dos veces por variante (~5 s; se habría caído con ~130 prendas) → 31 ms; variante visible = la de la pantalla; clics seguidos en Talla/Color; tramos con «sin stock en la sede». Los casos nuevos fallan con el SQL anterior.
- [ ] Con ~3 000 prendas, guardar el texto normalizado del buscador en una columna con índice trigram (hoy ~390 ms a ese volumen, medido).
- [x] **EN PRODUCCIÓN (2026-10-02):** Felipe pegó `20261002200000` y `20261002200100`; las 5 huellas coinciden y el humo con sesión de líder da 87 activas en el listado nuevo, en `fn_productos` y en los conteos.
- [ ] Refrescar el volcado de producción (`docs/datos/generado/COMO-REFRESCAR.md`) después de pegar: `datos:comparar` hoy marca las dos funciones como «sin respaldo» (esperado).
- [ ] Limpieza posterior: borrar `fn_productos`/`fn_productos_resumen`/`fn_productos_buscar` cuando nada las llame (hoy `fn_productos` la usan otras lecturas: buscar antes).
