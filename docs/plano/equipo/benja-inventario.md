# Benja — Halcón — Inventario y movimientos

> Extraído del plano maestro (143 decisiones, `docs/plano/00-ACTA-24-DECISIONES.md` y
> `02` a `05-ACTA-SESION-*.md`). Cada línea es una decisión ya tomada por Felipe — no es
> una propuesta, es lo que hay que construir o ya está construido.

## Decisiones

**PL-06** — Lo histórico sigue entrando poco a poco sin censo formal; el censo físico con fecha de corte —que se vuelve el saldo inicial oficial del stock— va después del lanzamiento de TRU, y cualquier diferencia que aparezca entra siempre como ajuste, nunca reescribiendo una venta ya hecha.
  *Pendiente:* Falta que Felipe fije la fecha del censo una vez arrancada TRU — sin esa fecha el módulo no se puede dar por terminado (bloquea PL-03) y toda alerta de reorden que armes es sospechosa.

**PL-25** — El flete de un traslado entre sedes lo paga siempre la tienda que recibe, sin excepción.

**PL-26** — El umbral de 'estancado' arranca en un solo número para todo el catálogo: 30 días.
  *Pendiente:* Se afina por categoría más adelante junto con las líderes de equipo — el 30 es solo el punto de partida.

**PL-37** — Cada tienda tiene un tope de efectivo en caja que Felipe define, con aviso cuando el efectivo esperado del día lo supera.
  *Pendiente:* Confirma si esto es tuyo o de Dany/Colibrí según cómo se reparta la caja física de tu sede — falta que Felipe fije el monto por tienda y que se construya el aviso, hoy no existe.

**PL-71** — CCO (la sede corporativa) entra como un tipo más de ubicación: se agrega 'corporativo' al CHECK de ubicaciones.tipo y se crea la fila CCO, el mismo patrón que ya se usó para el Taller.
  *Pendiente:* Aplicar esa migración — además desbloquea archivar supabase/unificacion/ a docs/historico/ (PL-56/57).

**PL-77** — No se construye un candado contra sububicaciones duplicadas por tienda — Felipe confía en que solo el script de alta de sede las crea, contra la recomendación original.
  *Pendiente:* No hay nada que construir por decisión explícita, pero es un riesgo aceptado a ojo, no un candado: si alguien da de alta una sede por el editor SQL en vez del script, ahí se rompe.

**PL-78** — La venta rechaza cualquier stock que intente salir desde la sububicación Cuarentena.
  *Pendiente:* Construir el candado — hoy no existe en la base.

**PL-81** — Todo movimiento de stock debe llenar exactamente una columna de origen (venta, compra, producción o cambio) — nunca dos a la vez y nunca ninguna.
  *Pendiente:* Construir el candado — hoy no existe en la base.


## Tus pendientes, en orden

1. Construir el candado de origen único en movimientos (PL-81): sin esto tu única fuente de verdad puede quedar con un movimiento sin trazabilidad clara de quién descontó qué — es la base de todo lo demás.
2. Construir el candado que bloquea vender desde Cuarentena (PL-78): mientras no exista, una venta puede salir de ahí por error y eso es plata mal despachada, no un detalle de stock.
3. Empujar la fecha del censo físico con corte (PL-06): mientras no se fije, cualquier alerta de reorden que generes es sospechosa desde el día uno y el módulo no puede darse por terminado.
4. Aplicar la migración de 'corporativo' en ubicaciones.tipo y crear la fila CCO (PL-71): además desbloquea archivar unificacion/.
5. Revisar con las líderes de equipo el umbral de 30 días de 'estancado' por categoría (PL-26): el número inicial es solo para arrancar, no el definitivo.
6. Vigilar el riesgo aceptado de sububicaciones duplicadas por tienda (PL-77): no hay candado, solo la costumbre de usar el script de alta — si alguien crea una sede por SQL Editor, ahí revienta.
7. Aclarar si el tope de efectivo en tienda (PL-37) es tuyo o de Caja/Dany según tu sede: si te toca, falta que Felipe defina el monto y se construya el aviso.
