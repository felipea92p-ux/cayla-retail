# 2026-10-23 · Historial de compras (ADR-0480, actualización)

- «Facturas de proveedor» pasa a llamarse «Historial de compras» y queda de solo lectura: el papel puede ser factura, boleta, nota de venta o ninguno.
- El registro a mano (`/compras/nueva`) se retira de todo el ERP con sus atajos (Proveedores, Recibir, Análisis); la compra nace en «Mi plata para compras».
- Migración `20261023164000_compras_historial_de_compras.sql` (solo el nombre del módulo en Roles y accesos) **sin pegar en producción**; queda sin forma de registrar una compra a crédito (ver backlog).
