## 🧭 Apartados en tres pestañas, la «Mínima» (2026-11-28, ADR-0720) — solo web, sin migración; rama `claude/apartados-minima`

### Hecho

- [x] (0) ADR-0720 y (1) las tres pestañas: «Apartar», «Pendientes» e «Historial», en el mismo lugar en las cuatro vistas; el número de
  «Pendientes» es el de sus filas.
- [x] (2) «Pendientes» como una sola lista (`PendientesVista`, la tabla viva de Recibir): lo urgente primero, un botón por fila solo si hay
  algo que hacer, «Escribirles a los N», «Búscalo en Historial» y los pedidos entre tiendas debajo.
- [x] (3) «Historial» como lista de lo terminado (`HistorialVista`): entregado o devuelto, con su boleta, su monto y «Reimprimir»; el puente
  «Lo que falta hacer… está en Pendientes»; «Todo el historial» lee lo de antes de los 30 días; la columna «Canal» en las dos listas.
  Se fueron las cifras, la franja del lote, los cuatro filtros, «Qué ver» y las píldoras de período del Historial viejo (y con ellas la
  lectura de `resumen_separaciones` en esta pantalla).

### Sin hacer (dicho sin adornos)

- [ ] (4) Cobrar y entregar: «Más acciones» (Escribirle, Aplazar, Editar prendas, Cancelar apartado). Hasta entonces, **aplazar no tiene
  botón** (vivía en la fila del Historial viejo): las actividades 0 a 4 van juntas en el primer PR por eso.
- [ ] (4) Al volver del cobro con «Volver», la lista de Pendientes pierde lo buscado y su lugar: guardarlos.
- [ ] (5–11) Apartar, las hojas, sin «·» (también el chip del canal, «TikTok · Envío»), y el cierre (`/guia`, `/focus`, `/sugerir`,
  `/milimetro`, `/formidable`, `/chaos`, 375 px, prueba a ciegas).
- [ ] `TablaViva` en el celular (`components/ui/TablaViva.tsx:432-470`): cuando la tabla se ordena por una columna que también filtra, salen
  dos píldoras casi iguales, «Estado ↑» y «Estado ⌄» (pasa en Pendientes). Es de la pieza compartida, no de Apartados: que la de ordenar se
  lea como orden. Va en su propio PR (toca `components/ui/`: avisar qué cambia en Dynamic).
- [ ] `docs/datos/generado/DRIFT.md:38` todavía nombra `TodosVista.tsx`: se regenera con el diccionario, no a mano.
