# Formidable — tablero

El skill `/formidable` (ADR-0350, `.claude/skills/formidable/`) califica cada pantalla con dos notas: **leyes** (comprensión, 9 leyes) y **oficio visual**
(se mide en el navegador). Este tablero es el avance **módulo por módulo**; cada fila enlaza a su informe (`docs/formidable/<slug>.md`, historial, no se sobrescribe).

Es obligatorio **con tablero y sin prueba en el CI** por ahora: al terminar una pantalla o modal, correr `/formidable`. Una pantalla no cuenta como
Formidable porque sus modales lo sean, ni al revés.

**Estados:** `sin probar` · `en piloto` · `ciega ✓ · real sin probar` · `formidable` (leyes y oficio ≥ 8, y pasada real hecha) · `en deuda` (alguna ley < 5).

| Módulo | Pantalla / modal | Estado | Leyes | Oficio | Informe | Última medición |
|---|---|---|---|---|---|---|
| Catálogo | Marcas (`/productos/marcas`) | ciega ✓ (89 marcas inventadas) · real sin probar; 3 cambios propuestos, esperan OK | 7,2 · ley 1: 7 | 6 | [catalogo-marcas](catalogo-marcas.md) | 2026-10-10 |
| Inventario | Frescura del piso (`/inventario/frescura`) | ciega ✓ · real sin probar; re-análisis 2026-10-09 con base sembrada y 4 agentes; **los 3 cambios hechos y medidos el 2026-10-10** (`fcd9638b`); falta la ciega sobre la pantalla nueva, recalificar y `/chaos` | 6,9 (±0,5) · ley 1: 6 · ley 8: 5 (sin recalificar) | 7 (sin recalificar; 0 blancos de la pantalla < 24 px) | [inventario-frescura](inventario-frescura.md) | 2026-10-10 |
| Inventario | Traslados, billetera de pases (`/inventario/traslados`) | ciega ✓ · real sin probar; cambios 1–3 hechos (2026-10-06) | 7,5 · ley 1: 7 | 7 | [inventario-traslados](inventario-traslados.md) | 2026-10-06 |
| Inventario | Ventas sin registrar, la mesa «Puente» (`/inventario/por-regularizar`) | ciega ✓✓ (dos pruebas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-07) | 7,0 (provisional) · ley 1: 8 | 6 (provisional) | [inventario-ventas-sin-registrar](inventario-ventas-sin-registrar.md) | 2026-10-07 |
| Inventario | Rótulos de anaquel (`/rotulos`) | ciega ✓ (sobre capturas) · real sin probar; los 3 cambios hechos y recalificada (2026-10-09) | 8,0 · ley 1: 7 | 8 | [rotulos](rotulos.md) | 2026-10-09 |
| Catálogo | Editar producto ▸ «Precio por tienda» y su hoja (`/productos/[id]/editar`) | ciega ✓ · real sin probar; un error corregido y los 3 cambios hechos (2026-10-10) | 8,3 · ley 1: 7 | 10 | [catalogo-precio-por-tienda](catalogo-precio-por-tienda.md) | 2026-10-10 |

## Orden de despliegue (módulo por módulo, decidido 2026-10-05)
Inventario (piloto: Frescura del piso) → el resto del módulo → siguiente módulo que Felipe indique. El orden dentro de un módulo sale de
dónde duele más (mostrador antes que configuración).

## Cómo se agrega una fila
Al cerrar una corrida de `/formidable`: copia la nota de leyes y de oficio del informe, el estado, el enlace y la fecha. No inventes una nota sin evidencia: pon «sin probar».
