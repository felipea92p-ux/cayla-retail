# Al milímetro · «El banco dice» con el día sin cerrar (2026-11-13)

**Ruta:** `/finanzas/dinero/conciliacion` ▸ bloque «El banco dice» (`[data-guia="fin-conciliacion.banco-dice"]`).
**Rama:** `claude/interbank-empresas-reconciliation-5dd8de` · PR #1812.
**Qué cambió a la vista:** solo texto, dentro de piezas que ya existían: el estado nuevo `dia_sin_cerrar` (un `<Chip tono="pizarra">` y su frase en
`text-sm text-tinta`), la línea bajo la cifra del banco (`din-cuad-tenue`) y la frase de «por confirmar». Ninguna pieza nueva, ningún color, medida ni movimiento nuevo.

**Cómo se midió:** base privada (todas las migraciones + seed) con tres líneas del banco inventadas y la última subida del mismo día; ERP local con la cuenta del seed.
Medidores de `/milimetro`, `/espacio`, `/tipografia`, `/color`, `/movimiento` y `/textos` con `raiz` en el bloque, a 1024 × 768 claro, 375 × 812 claro y oscuro
(con el botón de la cabecera).

## Números

- **Graves: 0 · Medias: 0 · Leves: 0** en lo que cambió.
- Color: ningún texto del bloque falla en claro ni en oscuro (los que marca el medidor son del marco y de «Registrar gasto», fuera de este cambio).
- Tipografía: el chip nuevo mide 13 px, igual que todo `<Chip>` (pieza decidida, ADR-0358): decidido a propósito, no hallazgo de este cambio.
- 375 px: el chip, la frase y la línea bajo la cifra caben sin desplazamiento lateral (`scrollWidth` = 375).
- Movimiento: 0 animaciones nuevas.

## Sin medir

- La hoja «Subir extracto» con un archivo cuyo primer lote trae el sábado anterior (el panel no sube archivos). Lo cubre la prueba del lector
  (`lib/extracto-interbank.test.ts`) y la corrida con el extracto real de Felipe, que no se versiona: 17 saltos, los 17 en el borde.
- El foco (`{ foco: true }`): el cambio no agrega controles.
