## 2026-10-05 (El motor del piso cuenta las ventas cerradas sin prenda — contrato ADR-0334 × ADR-0328 act. 7)
Qué hice: el motor del piso (PR #787) quedó fusionado y pegado contando las ventas «sin registrar» solo mientras están pendientes; el cierre
de arranque de ADR-0334 (PR #800) las pasa a «cerrada sin prenda», y desde ese momento el motor dejaba de verlas. Una migración nueva
(`20261005160000`) reemplaza `fn_piso_plan_lectura` con el mismo cuerpo y un solo cambio: la anotada cuenta mientras no tenga prenda (pendiente
o cerrada sin prenda), en la señal para el Taller y en el reloj de hoy y ayer. La guarda se niega a pisar la función si alguien la cambió a mano
en producción. `pnpm pruebas:piso-plan` suma A8–A11 (con las funciones reales de cerrar, reabrir y regularizar) y M4: 59/59 en un Postgres
desechable armado como el CI (458 migraciones + seed), y la mutación (volver a «solo pendiente») pone A8, A9 y A10 en rojo. `pruebas:cola-arranque`
sigue 53/53. **Felipe la pegó en producción el mismo 2026-10-05**; verificada después en solo lectura (huella `33dfc4b1…`, los dos filtros, el
comentario y los permisos, 0 cierres de cola todavía).
Por qué así: una venta cerrada sin prenda fue real —se cobró y el cliente se llevó una prenda de esa categoría y talla—; lo único que no se sabe
es cuál. Para decidir qué colgar y qué pedir al Taller importa que se vendió, no qué código tenía. No cuenta dos veces porque el cierre no le
pone prenda ni escribe en el libro: su línea sigue en la centinela y cae solo en la rama de las anotadas (A8 lo comprueba).
Felipe se lleva: la migración llegó a producción antes del primer cierre, así que ninguna tienda perdió velocidad; desde ahora se puede cerrar la
cola de arranque de cualquier tienda. `20261004213000` no se vuelve a pegar nunca: devolvería el filtro viejo. Y una decisión abierta que salió
al mirar la cola: en AQP la bolsa de papel (S/ 0.50) se cobra como «sin registrar» con una categoría inventada (27 filas: carteras nude, anillos
talla 7…), y el motor las lee como demanda de esas prendas (backlog de la rama).
