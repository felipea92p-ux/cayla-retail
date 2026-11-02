## Taller — lo que sigue del análisis del 2-nov (2026-11-02)
Hecho en esta rama: P15, P10, P11 (parcial), P09 (Taller) y P12 (parcial). En el PR #1574 (otra rama): P01.
**Esperan a Felipe (dinero/stock/permisos):** P19 (motivo escrito y nombre al confirmar un costo atípico, va con P01), P02 (nota de crédito de Producción), P03 («Llegó una compra» como única puerta), P04 (aviso si la factura supera lo pedido), P05 (quién recibe lo que pidió: igual en Compras y Producción), P06 (validar RUC).
**Sin dinero, siguen:** P13 (el cero como «—» en la orden; va con P01, esperar #1574), P17 (tejido «+ Crear» como elegido), P07, P08 (tablero de SQL por pegar), P18 (pruebas de CI).
**P14:** apagar «Cuenta en Análisis, Frescura y el plan del piso» en las familias de accesorios (Catálogo ▸ Familias): lo decide Felipe.
**P11, lo que falta:** proveedor del lote en la fila (hay que traerlo en el cargador) y la nota de la conversión kilos→metros al abrir el lote.
Conflicto probable con #1574: `lib/guias/huellas/produccion.ordenes.numero.json` (las dos ramas re-aceptan la huella; basta re-correr `pnpm --filter web guias:huella produccion.ordenes.numero` tras fusionar).
**P09, lo que sigue (decide Felipe):** el grado en palabras es opt-in (`conGrado`); si se ve bien en Taller, generalizarlo a los 170 modales con guía es un `/unificar`. Falta también verlo en el navegador (375 px y oscuro).
**P12, lo que falta (toca dinero):** separador de miles en el monto (hay que cambiar cómo se lee un monto), saldo disponible junto a cada cuenta del banco y qué cuenta se propone primero (una lectura nueva de saldos), y preguntar el N.° de operación sin bloquear ya está como «conviene».

**Tercera tanda (2026-11-02):** hechos P13, P06 (aviso) y el ajuste de P12. Confirmados sin cambio de código: P17 (ya funciona como pide el artefacto), P18 (punta a punta ya pasa y está en el CI; las otras dos fallan por la base local desfasada).
**Esperan a Felipe, con recomendación:**
- **P07** (Resumen): «dejar de contar la tela de una orden con Corte hecho» esconde que su tela nunca se descontó del estante; recomiendo mantener la alarma de «ya cortó y no tiene su tela anotada» y avisar cuando un consumo por prenda se aleja mucho de lo normal (hace falta decir qué es «mucho»: ¿más de 5 m por prenda?).
- **P08**: recomiendo NO poner lectura tolerante por cada columna nueva (código extra que esconde el error); sí un paso fijo en `/abrir-pr`: «SQL por pegar antes de fusionar», listado en la descripción del PR.
- **P14**: apagar «Cuenta en Análisis, Frescura y el plan del piso» en las familias de accesorios (Catálogo ▸ Familias).
- **P04**: avisar, sin bloquear, cuando lo facturado supera lo pedido; falta el margen (propuesto 10 %).
- **P02, P03, P05, P19**: las cuatro decisiones de dinero y control de la Ola 1.
