# Innovación — tablero

La skill `/innovar` (ADR-0651, `.claude/skills/innovar/`) compara lo que existe en el ERP contra lo mejor y lo más nuevo del mundo y deja aquí
**todas** sus propuestas, para que ninguna se pierda en un chat y ninguna descartada se vuelva a proponer. Cada fila enlaza al informe de la
corrida que la encontró (`docs/innovacion/AAAA-MM-DD-<slug>.md`, historial: no se sobrescribe). Lo último del stack y de los referentes vive en
el radar, `docs/radar/`.

**Horizonte:** `Ahora` (se construye con el stack actual en días o semanas) · `Visión` (apuesta grande: meses, IA en el flujo, algo externo).
**Impacto** 1–5 (5 = cambia el día de todas las sedes) · **Esfuerzo** S (menos de 1 día) · M (1–3 días) · L (1–2 semanas) · XL (más).
**Estados:** `propuesta` → `aceptada` (Felipe dijo sí) → `hecha` (con su PR) · `descartada por Felipe` · `vencida` (lo que la frenaba cambió en
el radar; se vuelve a evaluar).

Las ideas que se descartaron en una corrida (ya existían, sin fuente, moda, no son para este volumen) no entran aquí: quedan en la sección
«Descartadas» de su informe, con el motivo.

| Id | Módulo | Propuesta | Horizonte | Impacto / esfuerzo | Estado | Informe | Fecha |
|---|---|---|---|---|---|---|---|
| apartados#1 | Ventas ▸ Apartados | La constancia lleva un QR con su código; Entregar lo lee con la pistola o la cámara | Ahora | 2 / S | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| apartados#2 | Ventas ▸ Apartados | «¿Va a volver?»: lo que cada cliente hizo con sus apartados anteriores, al recordar | Ahora | 3 / M | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| apartados#3 | Ventas ▸ Apartados | Página del apartado para el cliente (prendas, plazo, saldo, sede), sin cobrar | Ahora | 3 / M | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| apartados#4 | Ventas ▸ Apartados | Reservar online para probarse en la sede, 24 h sin pagar | Visión | 4 / L | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| apartados#5 | Ventas ▸ Apartados | QR de Yape o Plin con el monto exacto, conciliado solo | Visión | 4 / L | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| apartados#6 | Ventas ▸ Apartados | Cobrar el saldo por un enlace que vence | Visión | 3 / XL | propuesta | [informe](2026-11-13-vender-apartados.md) | 2026-11-13 |
| cambiar-de-modulo#1 | Finanzas ▸ Resumen | Encender la foto del diario que ya está en producción | Ahora | 4 / S | hecha (encendida en producción 2026-11-13) | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#2 | Plataforma | El tamaño del cómputo, decidido con datos (Medium compra memoria, no CPU) | Ahora | 3 / S | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#3 | Vender / Existencias | La copia del catálogo no se tira con cada publicación | Ahora | 3 / S | aceptada | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#4 | Inventario ▸ Existencias | Stock delgado + catálogo ya guardado: sin la lectura de 716 ms | Ahora | 4 / M | aceptada | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#5 | Plataforma | Vigía de rendimiento: foto horaria de pg_stat_statements y antes/después de cada pegado | Ahora | 4 / M | aceptada · en PR #1821 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#6 | Todo el ERP | El cronómetro del clic: cuánto tarda cada módulo en cada sede | Ahora | 5 / M | hecha (PR #1817) | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#7 | Marco (menú) | El menú precarga el módulo al posar el mouse | Ahora | 2 / S | en espera (staleTimes: ver backlog de la rama) | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#8 | Catálogo ▸ Productos | Una sola pieza «copia por versión» para vocabularios y Productos | Ahora | 4 / M | aceptada (hecha a medias: duplicados; faltan vocabularios) | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#9 | Base (reglas por fila) | Reglas por fila que Postgres pueda meter en la consulta, con vigía en el CI | Ahora | 4 / L | aceptada · empezada en PR #1823 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#10 | Vender / Existencias | «¿Dónde más hay?» se pregunta al abrir la prenda | Ahora | 3 / M | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#11 | Tienda web | El catálogo web se rearma solo si algo cambió | Ahora | 3 / M | aceptada · en PR #1825 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#12 | Inventario ▸ Existencias | En vivo parcha cantidades en vez de rehacer la pantalla | Ahora | 3 / M | en espera (desfasa «Hoy»: ver backlog de la rama) | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#13 | Motores (piso, compra) | Lo vendido por prenda, sede y día, guardado | Ahora | 4 / L | aceptada · por otro camino (CLAURE de una pasada, ADR-0658), PR #1822 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#14 | CI | Presupuesto de rendimiento: bloques leídos por RPC | Ahora | 4 / L | aceptada · en PR #1821 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#15 | Marco (identidad) | «Quién eres» una vez por sesión, no por clic | Ahora | 2 / M | aceptada · paso 1 en PR #1823 | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#16 | Finanzas ▸ Resumen | La foto del diario también por día del mes en curso | Ahora | 2 / M | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#17 | Precios en vivo | Avisos de la base en vez de sondeos cada 10 s | Visión | 2 / M | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#18 | Todo el ERP | Reabrir Cache Components con Partial Prefetching, ruta por ruta | Visión | 4 / XL | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#19 | Vender | Vender abre con el catálogo ya en el equipo (IndexedDB) | Visión | 4 / XL | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
| cambiar-de-modulo#20 | Marco (identidad) | La identidad viaja en el token (Custom Access Token Hook) | Visión | 4 / XL | propuesta | [informe](2026-11-13-cambiar-de-modulo.md) | 2026-11-13 |
