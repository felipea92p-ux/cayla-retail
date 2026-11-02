## Taller — lo que sigue del análisis del 2-nov (2026-11-02)
Hecho en esta rama: P15, P10, P11 (parcial), P09 (Taller) y P12 (parcial). En el PR #1574 (otra rama): P01.
**Esperan a Felipe (dinero/stock/permisos):** P19 (motivo escrito y nombre al confirmar un costo atípico, va con P01), P02 (nota de crédito de Producción), P03 («Llegó una compra» como única puerta), P04 (aviso si la factura supera lo pedido), P05 (quién recibe lo que pidió: igual en Compras y Producción), P06 (validar RUC).
**Sin dinero, siguen:** P13 (el cero como «—» en la orden; va con P01, esperar #1574), P17 (tejido «+ Crear» como elegido), P07, P08 (tablero de SQL por pegar), P18 (pruebas de CI).
**P14:** apagar «Cuenta en Análisis, Frescura y el plan del piso» en las familias de accesorios (Catálogo ▸ Familias): lo decide Felipe.
**P11, lo que falta:** proveedor del lote en la fila (hay que traerlo en el cargador) y la nota de la conversión kilos→metros al abrir el lote.
Conflicto probable con #1574: `lib/guias/huellas/produccion.ordenes.numero.json` (las dos ramas re-aceptan la huella; basta re-correr `pnpm --filter web guias:huella produccion.ordenes.numero` tras fusionar).
**P09, lo que sigue (decide Felipe):** el grado en palabras es opt-in (`conGrado`); si se ve bien en Taller, generalizarlo a los 170 modales con guía es un `/unificar`. Falta también verlo en el navegador (375 px y oscuro).
**P12, lo que falta (toca dinero):** separador de miles en el monto (hay que cambiar cómo se lee un monto), saldo disponible junto a cada cuenta del banco y qué cuenta se propone primero (una lectura nueva de saldos), y preguntar el N.° de operación sin bloquear ya está como «conviene».
