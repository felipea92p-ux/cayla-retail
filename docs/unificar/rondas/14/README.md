# Ronda 14 de `/unificar`: la línea, las barras por tiempo, la barra a escala y la dona (fuentes)

Armada el 2026-10-15 (rama `claude/unificar-ronda-14`) sobre el mapa de los gráficos de la ronda 13 ([rondas/13/graficos.md](../13/graficos.md))
y fotos de lo de hoy en su pantalla (8 con datos en la base local; lo demás, recreado con cifras de ejemplo). **Decidida el mismo día: Felipe
eligió P1 en las cuatro tocando las demos, y se migró (deuda 0).** Registros: [grafico.linea.md](../../grafico.linea.md),
[grafico.barras.md](../../grafico.barras.md), [grafico.escala.md](../../grafico.escala.md) y la actualización de
[grafico.barra.md](../../grafico.barra.md). La página vive en `apps/web/unificar/.salida/elegir-ronda14/` (fuera de git); estas son sus
fuentes y los scripts de la ronda.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `grafico.linea` | Cómo se ve una línea que va en el tiempo contra una referencia | P1 (recomendada: tinta con área, referencia punteada, ejes cortos, guía con globito) · P2 (solo las dos líneas y la cifra) · A (hoy: cuatro) |
| 2 | `grafico.barras` | Cómo se ven las barras por hora, día o mes | P1 (recomendada: arena con la que importa en tinta, su cifra y un globito) · P2 (los «hilos» del Historial) · A (hoy: once) |
| 3 | `grafico.escala` | Cómo se ve la barra que compara a escala | P1 (recomendada: la barra de avance en tinta) · P2 (sin pista, la mayor en tinta) · A (hoy: cuatro) |
| 4 | `grafico.barra` | ¿La dona de lo cobrado pasa a la barra apilada? | P1 (recomendada: sí, como «Cómo se pagó») · A (hoy: la dona) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `bajar-css.mjs` | baja el CSS real del ERP de hoy (con la cuenta `integrante`) |
| `piezas.mjs`, `demo14.css`, `demo14.js` | las demos: líneas con guía y globito, barras con globito, barras a escala y la dona; usan `demo9.css` y `demo9.js` de la ronda 9 |
| `construir.mjs` | arma `spec.json` y llama a `apps/web/unificar/elegir.mjs` |
| `fotos.mjs` | fotografía los gráficos de hoy en su pantalla (y, con `DESPUES=1`, los de después de migrar) |
| `linea-viva.mjs` | busca una línea con datos en el ERP local (el plan de campaña, Rendimiento ▸ Mes) y la fotografía con la guía puesta |
| `firmas.mjs` | prueba las firmas candidatas contra el código de antes (HEAD) y el de ahora |
| `ver-demos.mjs` | fotografía cada tarjeta de la página (claro u oscuro) |
| `empaquetar.mjs` | la página en un solo archivo (`elegir-ronda14-un-archivo.html`, ~2,4 MB) |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda14/`; los demás, desde `apps/web`.
