# 2026-10-23 · El telar de Finanzas: la barra común (PR 1)

- **Qué:** la mesa de mando de Finanzas en los seis submódulos (pestañas, hilos de sede, mes, «Te toca», «Registrar gasto»), con la sede y el
  mes en la URL (`?sede=`, `?mes=`), los colores de sede como tokens y Gastos con la cabecera única, la respuesta, el orillo y el dock (ADR-0493).
- **Por qué:** cada submódulo tenía su selector de sede con su propio valor por defecto, y al pasar de uno a otro la sede cambiaba sola. En
  Gastos, además, solo el líder podía elegir, aunque la base también deja a otros roles.
- **Qué falta:** Gastos (el retazo, el calendario, «Por ordenar», la lista con filtros a la vista) y la hoja «Registrar gasto», en el PR 2.
  Las otras cinco sesiones enchufan su submódulo sobre la barra cuando el PR 1 esté en main.
