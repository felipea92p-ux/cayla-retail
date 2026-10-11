# Formidable — tablero

El skill `/formidable` (ADR-0350, `.claude/skills/formidable/`) califica cada pantalla con dos notas: **leyes** (comprensión, 9 leyes) y **oficio visual**
(se mide en el navegador). Este tablero es el avance **módulo por módulo**; cada fila enlaza a su informe (`docs/formidable/<slug>.md`, historial, no se sobrescribe).

Es obligatorio **con tablero y sin prueba en el CI** por ahora: al terminar una pantalla o modal, correr `/formidable`. Una pantalla no cuenta como
Formidable porque sus modales lo sean, ni al revés.

**Estados:** `sin probar` · `en piloto` · `ciega ✓ · real sin probar` · `formidable` (leyes y oficio ≥ 8, y pasada real hecha) · `en deuda` (alguna ley < 5).

| Módulo | Pantalla / modal | Estado | Leyes | Oficio | Informe | Última medición |
|---|---|---|---|---|---|---|
| Catálogo | Marcas (`/productos/marcas`) | ciega ✓ (89 marcas inventadas) · real sin probar; 3 cambios propuestos, esperan OK | 7,2 · ley 1: 7 | 6 | [catalogo-marcas](catalogo-marcas.md) | 2026-10-10 |
| Inventario | Frescura del piso (`/inventario/frescura`) | re-análisis 2026-10-10 (c) de «la tienda de un vistazo»: 2 ciegas (tienda y CAYLA Global) + crítico + revisor + 3 escépticos; **los 3 cambios y la lista aparte aprobada, hechos y medidos** (`7dcd61e3`); real sin probar; falta la ciega sobre la pantalla nueva y `/chaos` | 6,0 · ley 1: 6 · leyes 2, 8 y 9: 5 (antes de los cambios) | 6 (antes de los cambios; 0 blancos < 24 px, pliegue resuelto) | [inventario-frescura](inventario-frescura.md) | 2026-10-10 |
| Inventario | Plan del piso ▸ Propuesta (`/inventario/plan-del-piso`) | ciega ✓ (Opus; datos inventados; 5 s no concluyente) · real sin probar; **los 3 cambios hechos y medidos (2026-10-10)** + 7 arreglos del escéptico + la tabla a 1024 px arreglada (c), sin publicar; la ruta real no se vio contra su base (la local no tiene sus tablas); falta `/chaos` sobre Grupos | 6,0 · ley 1: 6 · ley 6: 4 | 7 (provisional) | [plan-del-piso](plan-del-piso.md) | 2026-10-10 |
| Inventario | Traslados, billetera de pases (`/inventario/traslados`) | ciega ✓ · real sin probar; cambios 1–3 hechos (2026-10-06) | 7,5 · ley 1: 7 | 7 | [inventario-traslados](inventario-traslados.md) | 2026-10-06 |
| Inventario | Ventas sin registrar, la mesa «Puente» (`/inventario/por-regularizar`) | ciega ✓✓ (dos pruebas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-07) | 7,0 (provisional) · ley 1: 8 | 6 (provisional) | [inventario-ventas-sin-registrar](inventario-ventas-sin-registrar.md) | 2026-10-07 |
| Inventario | Rótulos de anaquel (`/rotulos`) | ciega ✓ (sobre capturas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-09) | 8,0 · ley 1: 7 | 8 | [rotulos](rotulos.md) | 2026-10-09 |
| Catálogo | Editar producto ▸ «Precio por tienda» y su hoja (`/productos/[id]/editar`) | ciega ✓ · real sin probar; un error corregido y los 3 cambios hechos (2026-10-10) | 8,3 · ley 1: 7 | 10 | [catalogo-precio-por-tienda](catalogo-precio-por-tienda.md) | 2026-10-10 |
| Inventario | Análisis (`/inventario/resumen`), por modelo (ADR-0357 decisión 12) | sin probar: solo medido (`rapido`); sin desbordes a 1440, 1024 ni 375 | — | — | [inventario-resumen](inventario-resumen.md) | 2026-10-10 |
| Compras | Plan de campaña (`/compras/plan`): la pantalla, su hoja de categoría, el paso a paso, «Poner el tope» y «Nueva campaña» | ciega ✓ · real sin probar; **los 3 cambios hechos y medidos (2026-10-10)**, sin publicar; falta la ciega sobre la pantalla nueva | 6,8 (provisional; antes 5,1) · ley 1: 6 | 9 (antes 7) | [compras-plan](compras-plan.md) | 2026-10-10 |
| Producción | Nueva orden ▸ Modelo nuevo, hoja de `/produccion/ordenes` | ciega ✓ (Opus; entró como líder; sin repetir tras los cambios) · real sin probar; los 3 cambios aplicados (2026-10-10) | 5,4 (provisional) · ley 1: 6 · ley 5: 4 | 5 (crudo 4) | [produccion-nueva-orden](produccion-nueva-orden.md) | 2026-10-10 |

## Orden de despliegue (módulo por módulo, decidido 2026-10-05)
Inventario (piloto: Frescura del piso) → el resto del módulo → siguiente módulo que Felipe indique. El orden dentro de un módulo sale de
dónde duele más (mostrador antes que configuración).

## Cómo se agrega una fila
Al cerrar una corrida de `/formidable`: copia la nota de leyes y de oficio del informe, el estado, el enlace y la fecha. No inventes una nota sin evidencia: pon «sin probar».
