export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  retail: {
    Tables: {
      activos_fijos: {
        Row: {
          costo: number
          created_at: string
          cuenta_codigo: string | null
          depreciacion_apertura: number
          descripcion: string | null
          estado: string
          fecha_adquisicion: string
          id: string
          nombre: string
          nota: string | null
          serie: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at: string
          valor_residual: number
          vida_util_meses: number
        }
        Insert: {
          costo: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion: string
          id?: string
          nombre: string
          nota?: string | null
          serie?: string | null
          tasa_anual: number
          ubicacion_id: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses: number
        }
        Update: {
          costo?: number
          created_at?: string
          cuenta_codigo?: string | null
          depreciacion_apertura?: number
          descripcion?: string | null
          estado?: string
          fecha_adquisicion?: string
          id?: string
          nombre?: string
          nota?: string | null
          serie?: string | null
          tasa_anual?: number
          ubicacion_id?: string
          updated_at?: string
          valor_residual?: number
          vida_util_meses?: number
        }
        Relationships: [
          {
            foreignKeyName: "activos_fijos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          caja_id: string
          created_at: string
          id: string
          monto: number
          motivo: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          id?: string
          monto: number
          motivo: string
          tipo: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          id?: string
          monto?: number
          motivo?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          abierta_en: string
          abierta_por: string | null
          cerrada_en: string | null
          cerrada_por: string | null
          diferencia: number | null
          estado: string
          id: string
          monto_apertura: number
          monto_cierre_real: number | null
          monto_cierre_sistema: number | null
          nota: string | null
          ubicacion_id: string
        }
        Insert: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          nota?: string | null
          ubicacion_id: string
        }
        Update: {
          abierta_en?: string
          abierta_por?: string | null
          cerrada_en?: string | null
          cerrada_por?: string | null
          diferencia?: number | null
          estado?: string
          id?: string
          monto_apertura?: number
          monto_cierre_real?: number | null
          monto_cierre_sistema?: number | null
          nota?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      cambios: {
        Row: {
          cantidad: number
          created_at: string
          diferencia: number
          id: string
          metodo_pago_diferencia: string | null
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_nueva_id: string
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          diferencia?: number
          id?: string
          metodo_pago_diferencia?: string | null
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_nueva_id?: string
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_variante_nueva_id_fkey"
            columns: ["variante_nueva_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cambios_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activo: boolean
          familia: string | null
          id: string
          nombre: string
          prefijo: string | null
        }
        Insert: {
          activo?: boolean
          familia?: string | null
          id?: string
          nombre: string
          prefijo?: string | null
        }
        Update: {
          activo?: boolean
          familia?: string | null
          id?: string
          nombre?: string
          prefijo?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string
          num_doc: string | null
          telefono: string | null
          tipo_doc: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          nombre: string
          num_doc?: string | null
          telefono?: string | null
          tipo_doc?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          num_doc?: string | null
          telefono?: string | null
          tipo_doc?: string | null
        }
        Relationships: []
      }
      codigos_barras: {
        Row: {
          codigo: string
          created_at: string
          id: string
          origen: string
          variante_id: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          origen?: string
          variante_id: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          origen?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "codigos_barras_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_correlativos: {
        Row: {
          prefijo: string
          ultimo: number
          updated_at: string
        }
        Insert: {
          prefijo: string
          ultimo?: number
          updated_at?: string
        }
        Update: {
          prefijo?: string
          ultimo?: number
          updated_at?: string
        }
        Relationships: []
      }
      colaboradores: {
        Row: {
          agregado_por: string | null
          created_at: string
          persona_id: string
        }
        Insert: {
          agregado_por?: string | null
          created_at?: string
          persona_id: string
        }
        Update: {
          agregado_por?: string | null
          created_at?: string
          persona_id?: string
        }
        Relationships: []
      }
      colores: {
        Row: {
          activo: boolean
          codigo: string
          familia_color: string | null
          hex: string | null
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          familia_color?: string | null
          hex?: string | null
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          familia_color?: string | null
          hex?: string | null
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      compra_items: {
        Row: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion: string | null
          id: string
          producto_id: string
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad: number
          compra_id: string
          costo_unitario: number
          descripcion?: string | null
          id?: string
          producto_id: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number
          compra_id?: string
          costo_unitario?: number
          descripcion?: string | null
          id?: string
          producto_id?: string
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_pagos: {
        Row: {
          compra_id: string
          created_at: string
          fecha: string
          id: string
          metodo: string
          monto: number
          referencia: string | null
          usuario_id: string | null
        }
        Insert: {
          compra_id: string
          created_at?: string
          fecha?: string
          id?: string
          metodo: string
          monto: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Update: {
          compra_id?: string
          created_at?: string
          fecha?: string
          id?: string
          metodo?: string
          monto?: number
          referencia?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_pagos_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          condicion: string
          created_at: string
          documento: string | null
          estado: string
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number
          fecha_emision: string
          fecha_vencimiento: string | null
          id: string
          igv: number
          motivo_anulacion: string | null
          nota: string | null
          numero: string
          pagado: number
          proveedor_id: string
          recibido_cantidad: number
          saldo: number | null
          serie: string
          subtotal: number
          tipo: string
          total: number
          ubicacion_destino_id: string
          usuario_id: string | null
        }
        Insert: {
          condicion: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero: string
          pagado?: number
          proveedor_id: string
          recibido_cantidad?: number
          saldo?: number | null
          serie: string
          subtotal: number
          tipo?: string
          total: number
          ubicacion_destino_id: string
          usuario_id?: string | null
        }
        Update: {
          condicion?: string
          created_at?: string
          documento?: string | null
          estado?: string
          estado_pago?: string | null
          estado_recepcion?: string | null
          facturado_cantidad?: number
          fecha_emision?: string
          fecha_vencimiento?: string | null
          id?: string
          igv?: number
          motivo_anulacion?: string | null
          nota?: string | null
          numero?: string
          pagado?: number
          proveedor_id?: string
          recibido_cantidad?: number
          saldo?: number | null
          serie?: string
          subtotal?: number
          tipo?: string
          total?: number
          ubicacion_destino_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      comprobantes: {
        Row: {
          anulacion_solicitada_at: string | null
          anulado_at: string | null
          anulado_por: string | null
          cliente_nombre: string | null
          cliente_num_doc: string | null
          cliente_tipo_doc: string
          comprobante_original_id: string | null
          created_at: string
          entorno_transmision: string | null
          enviado_at: string | null
          estado: string
          id: string
          igv: number
          items: Json | null
          moneda: string
          motivo: string | null
          motivo_anulacion: string | null
          motivo_rechazo: string | null
          numero: number
          respuesta_anulacion: Json | null
          respuesta_sunat: Json | null
          serie: string
          subtotal: number
          tipo: string
          total: number
          ubicacion_id: string
          usuario_id: string | null
          venta_id: string | null
        }
        Insert: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie: string
          subtotal?: number
          tipo: string
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Update: {
          anulacion_solicitada_at?: string | null
          anulado_at?: string | null
          anulado_por?: string | null
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          cliente_tipo_doc?: string
          comprobante_original_id?: string | null
          created_at?: string
          entorno_transmision?: string | null
          enviado_at?: string | null
          estado?: string
          id?: string
          igv?: number
          items?: Json | null
          moneda?: string
          motivo?: string | null
          motivo_anulacion?: string | null
          motivo_rechazo?: string | null
          numero?: number
          respuesta_anulacion?: Json | null
          respuesta_sunat?: Json | null
          serie?: string
          subtotal?: number
          tipo?: string
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_comprobante_original_id_fkey"
            columns: ["comprobante_original_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracion_empresa: {
        Row: {
          email: string | null
          id: boolean
          nombre_comercial: string | null
          razon_social: string
          resolucion_autorizacion: string | null
          ruc: string
          telefono: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social: string
          resolucion_autorizacion?: string | null
          ruc: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          email?: string | null
          id?: boolean
          nombre_comercial?: string | null
          razon_social?: string
          resolucion_autorizacion?: string | null
          ruc?: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      conteo_items: {
        Row: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia: number | null
          id: string
          movimiento_id: string | null
          variante_id: string
        }
        Insert: {
          cantidad_contada: number
          cantidad_sistema: number
          conteo_id: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id: string
        }
        Update: {
          cantidad_contada?: number
          cantidad_sistema?: number
          conteo_id?: string
          diferencia?: number | null
          id?: string
          movimiento_id?: string | null
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_items_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos: {
        Row: {
          abierto_por: string | null
          cerrado_en: string | null
          cerrado_por: string | null
          created_at: string
          estado: string
          id: string
          sububicacion_id: string | null
          ubicacion_id: string
        }
        Insert: {
          abierto_por?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          sububicacion_id?: string | null
          ubicacion_id: string
        }
        Update: {
          abierto_por?: string | null
          cerrado_en?: string | null
          cerrado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          sububicacion_id?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_sububicacion_id_fkey"
            columns: ["sububicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucion_items: {
        Row: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id: string
          movimiento_id: string | null
          venta_item_id: string
        }
        Insert: {
          cantidad: number
          condicion: string
          devolucion_id: string
          id?: string
          movimiento_id?: string | null
          venta_item_id: string
        }
        Update: {
          cantidad?: number
          condicion?: string
          devolucion_id?: string
          id?: string
          movimiento_id?: string | null
          venta_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_items_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_items_venta_item_id_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estado: string
          id: string
          motivo: string
          reembolso_metodo: string | null
          reembolso_monto: number | null
          solicitado_por: string | null
          ubicacion_id: string
          venta_id: string
        }
        Insert: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo: string
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id: string
          venta_id: string
        }
        Update: {
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          motivo?: string
          reembolso_metodo?: string | null
          reembolso_monto?: number | null
          solicitado_por?: string | null
          ubicacion_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          proveedor_id: string
          recibido_por: string | null
          ubicacion_id: string
        }
        Insert: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id: string
          recibido_por?: string | null
          ubicacion_id: string
        }
        Update: {
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          proveedor_id?: string
          recibido_por?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          cambio_id: string | null
          cantidad: number
          compra_item_id: string | null
          conteo_item_id: string | null
          created_at: string
          devolucion_item_id: string | null
          id: string
          lote_id: string | null
          motivo: string | null
          nota: string | null
          sububicacion_destino_id: string | null
          sububicacion_id: string | null
          tipo: string
          transferencia_item_id: string | null
          ubicacion_destino_id: string | null
          ubicacion_id: string
          usuario_id: string | null
          variante_id: string
          venta_item_id: string | null
        }
        Insert: {
          cambio_id?: string | null
          cantidad: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo: string
          transferencia_item_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id: string
          usuario_id?: string | null
          variante_id: string
          venta_item_id?: string | null
        }
        Update: {
          cambio_id?: string | null
          cantidad?: number
          compra_item_id?: string | null
          conteo_item_id?: string | null
          created_at?: string
          devolucion_item_id?: string | null
          id?: string
          lote_id?: string | null
          motivo?: string | null
          nota?: string | null
          sububicacion_destino_id?: string | null
          sububicacion_id?: string | null
          tipo?: string
          transferencia_item_id?: string | null
          ubicacion_destino_id?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
          variante_id?: string
          venta_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_cambio_id_fkey"
            columns: ["cambio_id"]
            isOneToOne: false
            referencedRelation: "cambios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_compra_item_id_fkey"
            columns: ["compra_item_id"]
            isOneToOne: false
            referencedRelation: "compra_items_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_conteo_item_fkey"
            columns: ["conteo_item_id"]
            isOneToOne: false
            referencedRelation: "conteo_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_devolucion_item_fkey"
            columns: ["devolucion_item_id"]
            isOneToOne: false
            referencedRelation: "devolucion_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_destino_id_fkey"
            columns: ["sububicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sububicacion_id_fkey"
            columns: ["sububicacion_id"]
            isOneToOne: false
            referencedRelation: "sububicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_transferencia_item_fkey"
            columns: ["transferencia_item_id"]
            isOneToOne: false
            referencedRelation: "transferencia_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_venta_item_fkey"
            columns: ["venta_item_id"]
            isOneToOne: false
            referencedRelation: "venta_items"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          categoria_id: string | null
          codigo: string | null
          created_at: string
          descripcion: string | null
          estado: string
          id: string
          referencia: string
        }
        Insert: {
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          referencia: string
        }
        Update: {
          categoria_id?: string | null
          codigo?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          id?: string
          referencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      proformas: {
        Row: {
          cliente_nombre: string | null
          cliente_num_doc: string | null
          comprobante_id: string | null
          created_at: string
          estado: string
          id: string
          igv: number
          items: Json
          subtotal: number
          total: number
          ubicacion_id: string
          usuario_id: string | null
          vence_at: string | null
        }
        Insert: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items: Json
          subtotal?: number
          total: number
          ubicacion_id: string
          usuario_id?: string | null
          vence_at?: string | null
        }
        Update: {
          cliente_nombre?: string | null
          cliente_num_doc?: string | null
          comprobante_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          igv?: number
          items?: Json
          subtotal?: number
          total?: number
          ubicacion_id?: string
          usuario_id?: string | null
          vence_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proformas_comprobante_id_fkey"
            columns: ["comprobante_id"]
            isOneToOne: false
            referencedRelation: "comprobantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proformas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean
          contacto: string | null
          created_at: string
          id: string
          nombre: string
          ruc: string | null
        }
        Insert: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          id?: string
          nombre: string
          ruc?: string | null
        }
        Update: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          id?: string
          nombre?: string
          ruc?: string | null
        }
        Relationships: []
      }
      series_comprobantes: {
        Row: {
          id: string
          serie: string
          siguiente_numero: number
          tipo: string
          ubicacion_id: string
        }
        Insert: {
          id?: string
          serie: string
          siguiente_numero?: number
          tipo: string
          ubicacion_id: string
        }
        Update: {
          id?: string
          serie?: string
          siguiente_numero?: number
          tipo?: string
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_comprobantes_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          cantidad: number
          ubicacion_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          ubicacion_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          ubicacion_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      sububicaciones: {
        Row: {
          created_at: string
          id: string
          nombre: string
          tipo: string | null
          ubicacion_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
          tipo?: string | null
          ubicacion_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
          tipo?: string | null
          ubicacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sububicaciones_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencia_items: {
        Row: {
          cantidad: number
          id: string
          movimiento_id: string | null
          transferencia_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          id?: string
          movimiento_id?: string | null
          transferencia_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          movimiento_id?: string | null
          transferencia_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencia_items_movimiento_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_transferencia_id_fkey"
            columns: ["transferencia_id"]
            isOneToOne: false
            referencedRelation: "transferencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencia_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      transferencias: {
        Row: {
          creado_por: string | null
          created_at: string
          estado: string
          id: string
          nota: string | null
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          nota?: string | null
          ubicacion_destino_id: string
          ubicacion_origen_id: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          estado?: string
          id?: string
          nota?: string | null
          ubicacion_destino_id?: string
          ubicacion_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transferencias_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transferencias_ubicacion_origen_id_fkey"
            columns: ["ubicacion_origen_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicacion_datos_fiscales: {
        Row: {
          departamento: string | null
          direccion: string | null
          distrito: string | null
          provincia: string | null
          telefono: string | null
          ubicacion_id: string
          ubigeo: string | null
          updated_at: string
        }
        Insert: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id: string
          ubigeo?: string | null
          updated_at?: string
        }
        Update: {
          departamento?: string | null
          direccion?: string | null
          distrito?: string | null
          provincia?: string | null
          telefono?: string | null
          ubicacion_id?: string
          ubigeo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ubicacion_datos_fiscales_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: true
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ubicaciones: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          sede_dynamic_id: string | null
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          sede_dynamic_id?: string | null
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          sede_dynamic_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      variantes: {
        Row: {
          activo: boolean
          codigo: string | null
          color_codigo: string | null
          costo: number
          created_at: string
          id: string
          precio: number
          producto_id: string
          sku: string
          talla: string | null
        }
        Insert: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio: number
          producto_id: string
          sku: string
          talla?: string | null
        }
        Update: {
          activo?: boolean
          codigo?: string | null
          color_codigo?: string | null
          costo?: number
          created_at?: string
          id?: string
          precio?: number
          producto_id?: string
          sku?: string
          talla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "variantes_color_codigo_fkey"
            columns: ["color_codigo"]
            isOneToOne: false
            referencedRelation: "colores"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          descuento_unitario: number
          id: string
          precio_unitario: number
          subtotal: number | null
          variante_id: string
          venta_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          descuento_unitario?: number
          id?: string
          precio_unitario: number
          subtotal?: number | null
          variante_id: string
          venta_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          descuento_unitario?: number
          id?: string
          precio_unitario?: number
          subtotal?: number | null
          variante_id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_items_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_pagos: {
        Row: {
          id: string
          metodo: string
          monto: number
          venta_id: string
        }
        Insert: {
          id?: string
          metodo: string
          monto: number
          venta_id: string
        }
        Update: {
          id?: string
          metodo?: string
          monto?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_pagos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          caja_id: string | null
          cliente_id: string | null
          created_at: string
          id: string
          token_cliente: string | null
          ubicacion_id: string
          usuario_id: string | null
        }
        Insert: {
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          token_cliente?: string | null
          ubicacion_id: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          token_cliente?: string | null
          ubicacion_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_ubicacion_id_fkey"
            columns: ["ubicacion_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      compra_items_resumen: {
        Row: {
          cantidad: number | null
          compra_id: string | null
          costo_unitario: number | null
          descripcion: string | null
          id: string | null
          pendiente: number | null
          producto_id: string | null
          recibido: number | null
          subtotal: number | null
          variante_id: string | null
        }
        Insert: {
          cantidad?: number | null
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Update: {
          cantidad?: number | null
          compra_id?: string | null
          costo_unitario?: number | null
          descripcion?: string | null
          id?: string | null
          pendiente?: never
          producto_id?: string | null
          recibido?: never
          subtotal?: number | null
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_resumen: {
        Row: {
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          numero: string | null
          pagado: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          ubicacion_destino_id: string | null
          vencida: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_ubicacion_destino_id_fkey"
            columns: ["ubicacion_destino_id"]
            isOneToOne: false
            referencedRelation: "ubicaciones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abrir_caja: {
        Args: { p_monto_apertura: number; p_ubicacion_id: string }
        Returns: string
      }
      abrir_conteo: {
        Args: { p_sububicacion_id?: string; p_ubicacion_id: string }
        Returns: string
      }
      actualizar_transmision_comprobante: {
        Args: {
          p_comprobante_id: string
          p_entorno: string
          p_estado: string
          p_motivo_rechazo?: string
          p_respuesta_sunat?: Json
        }
        Returns: undefined
      }
      agregar_colaborador: {
        Args: { p_persona_id: string }
        Returns: undefined
      }
      anular_compra: {
        Args: { p_compra_id: string; p_motivo: string }
        Returns: undefined
      }
      anular_comprobante: {
        Args: {
          p_comprobante_id: string
          p_confirmada: boolean
          p_motivo: string
          p_respuesta?: Json
        }
        Returns: undefined
      }
      aprobar_devolucion: {
        Args: {
          p_devolucion_id: string
          p_reembolso_metodo?: string
          p_reembolso_monto?: number
        }
        Returns: undefined
      }
      cerrar_caja: {
        Args: { p_caja_id: string; p_monto_real: number }
        Returns: {
          diferencia: number
          monto_real: number
          monto_sistema: number
        }[]
      }
      cerrar_conteo: {
        Args: { p_conteo_id: string }
        Returns: {
          lineas_ajustadas: number
          unidades_faltantes: number
          unidades_sobrantes: number
        }[]
      }
      conteo_contar: {
        Args: {
          p_cantidad_contada: number
          p_conteo_id: string
          p_variante_id: string
        }
        Returns: string
      }
      convertir_proforma_a_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_proforma_id: string
          p_tipo: string
          p_venta_id?: string
        }
        Returns: string
      }
      crear_devolucion: {
        Args: {
          p_items: Json
          p_motivo: string
          p_ubicacion_id: string
          p_venta_id: string
        }
        Returns: string
      }
      crear_proforma: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_igv: number
          p_items: Json
          p_subtotal: number
          p_total: number
          p_ubicacion_id: string
          p_vence_at?: string
        }
        Returns: string
      }
      emitir_comprobante: {
        Args: {
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_igv: number
          p_items?: Json
          p_subtotal: number
          p_tipo: string
          p_total: number
          p_ubicacion_id: string
          p_venta_id?: string
        }
        Returns: string
      }
      emitir_nota: {
        Args: {
          p_comprobante_original_id: string
          p_igv: number
          p_items?: Json
          p_motivo: string
          p_subtotal: number
          p_tipo: string
          p_total: number
        }
        Returns: string
      }
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_asignar_codigo_producto: {
        Args: { p_producto_id: string }
        Returns: string
      }
      fn_asignar_codigo_variante: {
        Args: { p_variante_id: string }
        Returns: string
      }
      fn_clave_texto: { Args: { p: string }; Returns: string }
      fn_colaboradores: {
        Args: never
        Returns: {
          agregado_en: string
          correo: string
          nombre: string
          persona_id: string
          sede: string
        }[]
      }
      fn_dynamic_disponibles: {
        Args: never
        Returns: {
          correo: string
          nombre: string
          persona_id: string
          sede: string
        }[]
      }
      fn_es_lider: { Args: never; Returns: boolean }
      fn_nombres_personas: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          nombre: string
        }[]
      }
      fn_persona_actual_resumen: {
        Args: never
        Returns: {
          es_lider: boolean
          nombre: string
          ubicacion_id: string
          ubicacion_nombre: string
          ubicacion_tipo: string
        }[]
      }
      fn_puede_operar_ubicacion: {
        Args: { p_ubicacion_id: string }
        Returns: boolean
      }
      fn_puede_registrar_compras: { Args: never; Returns: boolean }
      fn_reservar_numero_serie: {
        Args: { p_tipo: string; p_ubicacion_id: string }
        Returns: {
          numero: number
          serie: string
        }[]
      }
      fn_siguiente_correlativo: { Args: { p_prefijo: string }; Returns: number }
      fn_tiene_acceso_retail: { Args: never; Returns: boolean }
      fn_token_talla: { Args: { p_talla: string }; Returns: string }
      fn_ubicacion_actual_persona: { Args: never; Returns: string }
      fn_ventas_del_dia: {
        Args: { p_ubicacion_id?: string }
        Returns: {
          cliente_nombre: string
          comprobante_estado: string
          comprobante_texto: string
          comprobante_tipo: string
          hora: string
          items: Json
          metodos_pago: string
          total: number
          ubicacion_nombre: string
          vendedor: string
          venta_id: string
        }[]
      }
      listar_compras: {
        Args: {
          p_busqueda?: string
          p_con_saldo?: boolean
          p_condicion?: string
          p_cursor_fecha?: string
          p_cursor_id?: string
          p_desde?: string
          p_estado_pago?: string
          p_estado_recepcion?: string
          p_hasta?: string
          p_limite?: number
          p_orden?: string
          p_por_recibir?: boolean
          p_proveedor_id?: string
          p_solo_vencidas?: boolean
          p_solo_vigentes?: boolean
        }
        Returns: {
          condicion: string | null
          created_at: string | null
          documento: string | null
          estado: string | null
          estado_pago: string | null
          estado_recepcion: string | null
          facturado_cantidad: number | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string | null
          igv: number | null
          nota: string | null
          numero: string | null
          pagado: number | null
          proveedor_id: string | null
          proveedor_nombre: string | null
          proveedor_ruc: string | null
          recibido_cantidad: number | null
          saldo: number | null
          serie: string | null
          subtotal: number | null
          tipo: string | null
          total: number | null
          ubicacion_destino_id: string | null
          vencida: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "compras_resumen"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      quitar_colaborador: { Args: { p_persona_id: string }; Returns: undefined }
      recalcular_compras: { Args: never; Returns: undefined }
      recalcular_stock: { Args: never; Returns: undefined }
      rechazar_devolucion: {
        Args: { p_devolucion_id: string; p_motivo?: string }
        Returns: undefined
      }
      recibir_compras: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      recibir_lote: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_proveedor_id: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_cambio: {
        Args: {
          p_cantidad?: number
          p_metodo_pago_diferencia?: string
          p_token?: string
          p_ubicacion_id: string
          p_variante_nueva_id: string
          p_venta_item_id: string
        }
        Returns: string
      }
      registrar_compra: {
        Args: {
          p_condicion: string
          p_fecha_emision?: string
          p_fecha_vencimiento?: string
          p_igv_porcentaje?: number
          p_items: Json
          p_nota?: string
          p_numero: string
          p_pago?: Json
          p_proveedor_id: string
          p_serie: string
          p_tipo?: string
          p_ubicacion_destino_id: string
        }
        Returns: string
      }
      registrar_movimiento: {
        Args: {
          p_cantidad: number
          p_motivo?: string
          p_nota?: string
          p_tipo: string
          p_ubicacion_id: string
          p_variante_id: string
        }
        Returns: string
      }
      registrar_movimiento_caja: {
        Args: {
          p_caja_id: string
          p_monto: number
          p_motivo: string
          p_tipo: string
        }
        Returns: string
      }
      registrar_pago_compra: {
        Args: {
          p_compra_id: string
          p_fecha?: string
          p_metodo: string
          p_monto: number
          p_referencia?: string
        }
        Returns: string
      }
      registrar_serie_comprobante: {
        Args: {
          p_serie: string
          p_siguiente_numero?: number
          p_tipo: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_cliente_id?: string
          p_cliente_nombre?: string
          p_cliente_num_doc?: string
          p_cliente_tipo_doc?: string
          p_items: Json
          p_pagos: Json
          p_tipo_comprobante?: string
          p_token?: string
          p_ubicacion_id: string
        }
        Returns: string
      }
      resumen_compras: {
        Args: never
        Returns: {
          con_saldo: number
          deuda: number
          por_recibir: number
          registradas: number
          vencidas: number
          vencido: number
          vigentes: number
        }[]
      }
      transferir: {
        Args: {
          p_items: Json
          p_nota?: string
          p_ubicacion_destino_id: string
          p_ubicacion_origen_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  retail: {
    Enums: {},
  },
} as const

