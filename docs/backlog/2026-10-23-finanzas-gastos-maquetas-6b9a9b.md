# Backlog · El telar de Finanzas, Gastos (2026-10-23)

- [ ] Gastos: el retazo por categoría con su orillo de sedes, el calendario del mes, «Por ordenar» y la lista con los filtros a la vista
  (actividades 5 y 6 de `/construir`).
- [ ] La hoja «Registrar gasto» que se adapta al comprobante (actividades 7 a 10). Las migraciones de la actividad 9 (ticket, recibo de
  servicio, retención de 4ta, detracción, movilidad, «no deducible») esperan que el contador confirme las reglas y el OK de Felipe para
  producción; el reparto entre sedes (actividad 10) también.
- [ ] Cambiar la sede de un gasto ya guardado («Por ordenar»): una función nueva que guarda. Se hace en local y Felipe da el OK antes de
  pegarla en producción.
- [ ] Los otros cinco submódulos sacan su combo «Ver» y adoptan `veFinanzasDeTodoDe` al enchufarse a la barra. Mientras tanto, `?ver=` gana
  sobre `?sede=` (`sedeDeLaUrl`).
