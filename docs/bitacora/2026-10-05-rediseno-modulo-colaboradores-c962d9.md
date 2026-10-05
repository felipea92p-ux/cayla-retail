## 2026-10-05 (Colaboradores ▸ Equipo: una lista por sede y la ficha al costado — ADR-0340)
Qué hice: Felipe pidió una propuesta del módulo completo de Colaboradores con el formato de la de Existencias de Diego, y la
página quedó publicada (7 pantallas). Después eligió empezar por Equipo y la ficha. «Cuentas» pasó a ser «Equipo»: una lista
agrupada por sede (líderes, integrantes, suspendidos, aparatos), con atajos y buscador, el punto verde de quién está de turno
hoy (asistencia de Dynamic) y «Esperan tu ok» arriba solo si hay altas por aprobar. Tocar a una persona abre su ficha al costado:
una frase, tres botones (cambiar rol con la diferencia de módulos antes de confirmar, cambiar sede, suspender o reactivar),
«Deshacer» en lo reversible y su menú tal como lo ve. Quien está de baja en Dynamic sale como suspendido (decisión de Felipe).
También se quitó «Comparar roles» de Roles y accesos, a pedido de Felipe. Sin migraciones.
Por qué así: el negocio piensa por sede, y el estado es una marca sobre la persona, no un lugar donde buscarla. Lo reversible con
«Deshacer» en vez de confirmar le quita pasos a la persona sin quitar el historial (deshacer es otra llamada que queda anotada). Las
reglas de permisos (Admin, alcance, «solo das lo que tienes») no se tocaron: llegan ya resueltas a la ficha.
Lo que NO se hizo a propósito: poner a los de baja en Dynamic en su sede (la función de la base no devuelve la sede de retail;
cambiarla es una migración) y la regla de que el alta de un líder entre directo (decisión 1 de la propuesta, pendiente de Felipe).

## 2026-10-05 (Dar acceso: lo que da un líder entra directo, y con su rol — ADR-0341)
Qué hice: Felipe decidió que el alta que da un líder entre directo. Migración `20261005190000` (partida de la definición real de producción):
`agregar_colaborador(es)` gana `p_rol_id`, entra activa si la da un líder y pendiente si no, y no da el rol Líder al entrar. La pantalla
«Agregar colaboradores» pasó a ser «Dar acceso»: una hoja con guía (quién, dónde trabaja, qué rol, quién lo da) y una frase que resume
el alta antes de confirmar. Probado contra Postgres en transacciones con ROLLBACK (15 casos) y en el navegador a 1280 y 375 px.
Por qué así: dos clics del mismo líder no eran un control; el control real es que quien no es líder no meta a nadie solo, y eso se queda.
Elegir el rol al dar acceso evita un segundo viaje a otra pantalla. El rol Líder no se da al entrar porque subir a alguien a Líder
es de un Admin y merece su propio gesto.
**SQL sin pegar:** la migración va antes de fusionar (la web nueva manda `p_rol_id`).
