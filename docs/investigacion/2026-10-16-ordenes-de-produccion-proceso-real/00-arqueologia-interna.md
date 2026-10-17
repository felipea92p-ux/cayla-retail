# 00 · Arqueología interna: qué sabe ya el repo del proceso real

**Frente 0 · 2026-10-16 · solo lectura.** Base: `cayla-dynamic`, schema `retail`, solo `SELECT`, consultada el 2026-10-16 (evidencia **A**). Documentos: `main` y la rama `claude/production-module-redesign-136cca` (**D** si lo dijo Felipe, **E** si lo infirió el arquitecto).

## Veredicto

Todo lo que el repo «sabe» del Taller sale de tres fuentes: las reglas R-25 a R-31 (entrevista del 12-sep), las respuestas de Felipe del 13 y 14-oct, y supuestos del arquitecto. **Nadie observó el Taller**: la visita A0 (30 min con la encargada) se propuso el 13-oct y ningún documento dice que se hizo. Las 8 migraciones del rediseño están pegadas; ninguna orden se ha abierto.

## 1 · Mapa de lo ya sabido

| Tema | Se da por cierto | Dónde | Quién · estado |
|---|---|---|---|
| Fases | Corte · Costura · Acabado, más Bordado, Estampado, Lavandería; trazo, tendido y habilitado dentro de Corte | ADR-0400 d.2 | Felipe eligió la lista (D), decidido; «caben en Corte» es del arquitecto (E), hipótesis |
| Tercerización | Una fase entera, un solo quién, fijado al abrir; el corte también puede salir | d.3, R-29 | Felipe, decidido |
| Tarifas | Por prenda, mínimo 150–240, fijo opcional, congelada al abrir | d.5, R-30 | Felipe, decidido; tarifas reales: desconocido (0 filas) |
| Tela y consumo | Metros; lo de Audaces se escribe una vez y lo medido corrige | d.6, R-25/26 | Felipe, decidido; formato Audaces: desconocido |
| Avance | «Terminé N de M» por fase, talla y color; sin bulto ni operaria | d.1, d.7 | Felipe aceptó «tipo A»; su razón («10 operarias») es del arquitecto, hipótesis |
| Segundas y faltantes | Segundas no entran al stock; faltante = enviado − devuelto; pérdida < 3 % | d.4, act. d, R-31 | Segundas: Felipe, decidido; faltante y 3 %: propuesto / estimación |
| Costeo | Promedio ponderado; servicio = devengado; mano de obra interna fuera | ADR-0067, d.5 | Felipe, decidido (ver C6) |
| Fechas | Entrega = sale del Taller; sin fecha pasada; plazo de reposición 7 (investigación de cobertura), ≈14 (nota de sesión, no versionada) o 30 (código) | supuestos, ADR-0415 | Arquitecto, propuesto; plazo real: desconocido |
| Permisos | Opera y ve costos quien ve Producción parado en el Taller | ADR-0161, 0396 | Felipe, decidido |
| Muestras | `es_muestra`; rondas diferidas | d.9 | Felipe, decidido |
| Documentos | Guía = texto; detracción 10 % sobre S/ 700 «solo avisa»; papel del servicio = gasto de Finanzas | A3, supuestos, ADR-0362 d.63 | Guía y detracción: arquitecto (E), `[externo, sin verificar]`; d.63: Felipe |
| Gente y papel | ~10 operarias; «el papel alcanza» | d.1 | Arquitecto, hipótesis sin respaldo |

## 2 · Ground truth en la base (A, 2026-10-16)

| Qué | Resultado |
|---|---|
| 28 tablas de Producción (órdenes, fases, avances, Salidas, Vueltas, insumos, tarifas, cotizaciones, comprobantes, órdenes de insumo) | Existen, **0 filas**, sin fechas. Las 17 funciones nuevas que consulté existen |
| `movimientos` | 4.008 (29-sep a 16-oct): 1.653 carga inicial, 1.262 internos, 536 conteos, 444 ventas. **0** con `produccion_id` o motivo de producción; **0** tocan el Taller; stock del Taller: 0 |
| Productos | 337 modelos (3 descontinuados), 1.934 variantes (1.868 activas). La base **no distingue «del Taller»**: marca CAYLA 26 modelos / 225 variantes; otras marcas 222 / 1.414; sin marca 89 / 295. Talla «Estándar»: 736 de las activas |
| Colaboradores del Taller | `retail`: 4 activos = 3 rol base colaborador (acceso «Integrante», 0 módulos) + 1 rol base integrante (acceso «Producción», único rol con el módulo). Dynamic, función taller_produccion: 3 activos (2 en planilla, 1 por honorarios) y 3 inactivos; personas pagadas por período: 6 → 5 → 3 |
| Proveedores de Producción | 0. Directorio de Compras: 92; 74 con rubro, en categorías de prenda (Polos 23, Camisas y Blusas 13, Casacas 10, Jeans 7, otros 21, uno «Gastos»); ninguno de tela, avíos o servicio |
| Gastos | 13 categorías, ninguna para producción encargada a terceros; 75 gastos vigentes, 0 en el Taller |

## 3 · Contradicciones internas

| # | Choque | Implica |
|---|---|---|
| C1 | R-25 «metro, kilo y rollo» (dato duro, sin nota) contra d.6 «solo metros»; la base admite unidad kilo, cono, par, docena, no rollo, sin conversión | H5 |
| C2 | R-26 importar Audaces; ADR-0133 d.5 «se mide, no se declara»; d.6 «se declara y lo medido corrige»; act. i deja a quien edita el catálogo pisar lo medido; R-27 por talla contra D-D por modelo | H6 |
| C3 | R-29 «corta y confecciona adentro, y terceriza confección»; d.3 deja salir el corte; «acabados» es bordado/estampado/lavandería en R-29 y la fase Acabado en d.2 | H2, H3 |
| C4 | R-31 «no hace falta modelar segunda calidad» contra Vuelta con segundas; los avances internos solo anotan buenas | H7, H8 |
| C5 | Cotización de maquila: descartada y revivida el 21-sep (D-31); «descartada 22-sep» en ADR-0133, PLAN F7 y módulo 10; ADR-0156 lo deja a Felipe; ADR-0400 la trata como viva; 0 filas, 0 llamadores | H4 |
| C6 | D-81 suma `productos.costo_mano_obra` (columna inexistente); lo construido solo suma tela y servicios | H1, H4 |
| C7 | «10 operarias» (d.1) contra «~5 personas» (PLAN F7) contra 3 activas en Dynamic | H1 |
| C8 | Sobrecorte: 10 % (d.7) contra max(2×plan, plan+5) en el cierre (ADR-0415) | H11 |
| C9 | Quién anota: «quien ve el módulo» (Q1) contra una sola cuenta compartida; las 3 «Integrante» del Taller no entran | H1 |
| C10 | A3 «el Taller no emite comprobantes» no tiene documento propio; su único antecedente es un filtro de Facturación (ADR-0051), no una norma de SUNAT; D-83 sí prevé guías electrónicas para traslados | H9 |
| C11 | d.63 «el servicio va a Finanzas» contra `categorias_gasto` sin esa categoría; «el proveedor dice si lleva IGV» sin columna | H10 |
| C12 | Obsoletos: 232 modelos (13-oct) contra 335 con variantes activas; ADR-0400 act. j «producción no tiene las tablas»; CLAUDE.md «solo lider y colaborador» contra el CHECK actual, que admite integrante | — |

## Lo que no encontré

Ninguna orden, nota del cuaderno, tarifa, plazo medido, reporte de Audaces ni fuente del «95 % trabaja por bultos» (d.1). No hay dato de operarias fuera de Dynamic. Las citas SENATI, PUCP, UNMSM y SUNAT del rediseño siguen `[externo, sin verificar]`.

## Preguntas que solo CAYLA puede contestar

1. ¿Cuántas personas cortan y cosen hoy y cómo se les paga (sueldo, honorarios, por pieza)?
2. ¿Qué papel o chat acompaña hoy una Salida y una Vuelta?
3. ¿Cuántos días pasan de cortar a colgar en tienda en una orden reciente?
4. ¿Qué fases salen hoy y a cuántos servicios?

## Fuentes

A: consultas `SELECT` a `retail.*` y `public.personas` (2026-10-16). D/E: `docs/datos/15-COMO-OPERA-CAYLA.md` §7; `docs/PLAN-PRODUCCION.md`; `docs/datos/DECISIONES-2026-09-12.md`, `-09-21-menu-comercial.md`; ADR 0051, 0067, 0133, 0156, 0362, 0396, 0409, 0415; en la rama del rediseño, ADR-0400, `docs/investigacion/2026-10-13-produccion-rediseno/README.md`, `docs/formidable/produccion-modulo.md`; rama `claude/tiempo-question-299a41`, `2026-10-13-cobertura-con-poca-muestra/README.md`.
