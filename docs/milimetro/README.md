# Al milímetro — tablero

**Obligatorio desde el 2026-11-12** (Felipe: «cada que se haga un cambio visual o se cree una nueva pantalla o se quiera auditar las
pantallas ya existentes se usen esas skills obligatoriamente»). Regla completa: `CLAUDE.md`, sección «Al milímetro».

| Cuándo | Qué se corre |
|---|---|
| Pantalla, modal o pieza nueva | `/milimetro diseñar <pieza>` antes del código |
| Cambio visual a algo que existe | `/milimetro auditar <ruta>` al terminar, en local |
| Auditar lo que ya existe | `/milimetro auditar <ruta|módulo>` |
| Una regla del repo que convendría mejorar | va a `propuestas.md`; se decide con `/milimetro proponer` |

El PR marca su casilla «pasó por `/milimetro`» (o «Al milímetro no aplica») y el check **«Al milímetro»** la pide cuando cambia un `.tsx`
de `apps/web/components/` o `apps/web/app/`, o un `.css` de `apps/web/app/`.

## Auditorías

Una fila por auditoría (la más nueva arriba). Graves = hallazgos de severidad «grave» que quedaron abiertos.

| Fecha | Ruta o pieza | Rama / PR | Graves abiertos | Notas |
|---|---|---|---|---|
| 2026-11-13 | `/productos` ▸ «Fusionar productos repetidos», dirección B «La ficha que se arma» (armar, revisar y comparar; 1440 claro/oscuro/quieto y 375) | `claude/fusionar-productos-rediseno` @ `cdef7467e` | 2 | Graves: el foco de la fila «Nombre» queda tapado entero por el pie fijo (WCAG 2.4.11; arreglo probado: `scroll-margin-bottom` en `.fus-opcion`) y el contorno de la celda «pasa» a 2,69:1 en claro (WCAG 1.4.11). Medias: la ficha abierta en Comparar solo la dice ARIA; casillas de fotos de 20 px con el dedo; letra < 14 px heredada de `Modal`/`CampoGuiado`. 6 leves. Sin medir: 3 fichas, «listo», errores. Informe: `auditorias/2026-11-13-fusionar-productos-rediseno.md` |
| 2026-11-12 | `/compras` (Historial de compras) | `claude/auditoria-milimetro-compras` | 0 | Primera corrida de los medidores contra el ERP real: 0 graves, 4 medias, 6 leves; arregladas 3 medias (rojo de «Venció», fila apilada propia, pie de paginación a 15 px), quedan el esqueleto global y las leves (backlog de la rama). 16 falsos positivos de los medidores arreglados. Informe: `auditorias/2026-11-12-compras.md` |
| 2026-11-12 | `/productos` ▸ «Fusionar productos repetidos» (hoja, aviso de posibles repetidas, botón de la vista rápida y de la Tabla) | `claude/merge-duplicate-products-09f938` · PR #1794 | 0 | 1 grave (el botón que confirma se apagaba por lo que faltaba, ADR-0611) y 1 media (lo elegido solo por color, WCAG 1.4.1), las dos arregladas; texto sin fallas; sin medir espacio, tipografía, color, movimiento y foco. Informe: `auditorias/2026-11-12-fusionar-productos.md` |
