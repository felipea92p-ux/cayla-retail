export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ajustes_efectivo: {
        Row: {
          created_at: string
          fecha: string
          id: string
          monto: number
          motivo: string
          sede_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          monto: number
          motivo: string
          sede_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          motivo?: string
          sede_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_efectivo_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_efectivo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          cantidad_requerida: number
          created_at: string
          id: string
          insumo: string
          producto_id: string
          unidad: string
        }
        Insert: {
          cantidad_requerida: number
          created_at?: string
          id?: string
          insumo: string
          producto_id: string
          unidad: string
        }
        Update: {
          cantidad_requerida?: number
          created_at?: string
          id?: string
          insumo?: string
          producto_id?: string
          unidad?: string
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
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
          monto_cierre_contado: number | null
          monto_cierre_esperado: number | null
          sede_id: string
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
          monto_cierre_contado?: number | null
          monto_cierre_esperado?: number | null
          sede_id: string
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
          monto_cierre_contado?: number | null
          monto_cierre_esperado?: number | null
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cajas_abierta_por_fkey"
            columns: ["abierta_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_cerrada_por_fkey"
            columns: ["cerrada_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          created_at: string
          familia: string
          id: string
          nombre: string
          tallas_sugeridas: string[] | null
        }
        Insert: {
          created_at?: string
          familia: string
          id?: string
          nombre: string
          tallas_sugeridas?: string[] | null
        }
        Update: {
          created_at?: string
          familia?: string
          id?: string
          nombre?: string
          tallas_sugeridas?: string[] | null
        }
        Relationships: []
      }
      contenedores: {
        Row: {
          codigo: string
          created_at: string
          id: string
          sede_id: string
          tipo: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          sede_id: string
          tipo: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          sede_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contenedores_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      depositos_bancarios: {
        Row: {
          created_at: string
          fecha: string
          id: string
          monto: number
          nota: string | null
          sede_id: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          fecha?: string
          id?: string
          monto: number
          nota?: string | null
          sede_id: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          fecha?: string
          id?: string
          monto?: number
          nota?: string | null
          sede_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "depositos_bancarios_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depositos_bancarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          created_at: string
          especificacion: string | null
          id: string
          igv: number
          metodo_pago: string | null
          sede_id: string
          subtotal: number
          total: number
          usuario_id: string | null
        }
        Insert: {
          categoria: string
          created_at?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago?: string | null
          sede_id: string
          subtotal?: number
          total: number
          usuario_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          especificacion?: string | null
          id?: string
          igv?: number
          metodo_pago?: string | null
          sede_id?: string
          subtotal?: number
          total?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          created_at: string
          fecha_recepcion: string
          id: string
          nota: string | null
          numero_guia: string | null
          orden_compra_id: string | null
          origen: string
          proveedor: string | null
          proveedor_id: string | null
          recibido_por: string | null
          sede_id: string
        }
        Insert: {
          created_at?: string
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          orden_compra_id?: string | null
          origen: string
          proveedor?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          sede_id: string
        }
        Update: {
          created_at?: string
          fecha_recepcion?: string
          id?: string
          nota?: string | null
          numero_guia?: string | null
          orden_compra_id?: string | null
          origen?: string
          proveedor?: string | null
          proveedor_id?: string | null
          recibido_por?: string | null
          sede_id?: string
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
            foreignKeyName: "lotes_recibido_por_fkey"
            columns: ["recibido_por"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lotes_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          canal: string | null
          cantidad: number
          contenedor_id: string | null
          created_at: string
          id: string
          lote_id: string | null
          monto: number | null
          motivo: string | null
          nota: string | null
          sede_destino_id: string | null
          sede_id: string
          tipo: string
          usuario_id: string | null
          variante_id: string
          venta_id: string | null
        }
        Insert: {
          canal?: string | null
          cantidad: number
          contenedor_id?: string | null
          created_at?: string
          id?: string
          lote_id?: string | null
          monto?: number | null
          motivo?: string | null
          nota?: string | null
          sede_destino_id?: string | null
          sede_id: string
          tipo: string
          usuario_id?: string | null
          variante_id: string
          venta_id?: string | null
        }
        Update: {
          canal?: string | null
          cantidad?: number
          contenedor_id?: string | null
          created_at?: string
          id?: string
          lote_id?: string | null
          monto?: number | null
          motivo?: string | null
          nota?: string | null
          sede_destino_id?: string | null
          sede_id?: string
          tipo?: string
          usuario_id?: string | null
          variante_id?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sede_destino_id_fkey"
            columns: ["sede_destino_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra: {
        Row: {
          created_at: string
          estado: string
          fecha: string
          fecha_estimada: string | null
          id: string
          monto_estimado: number | null
          nota: string | null
          proveedor: string
          proveedor_id: string | null
          sede_destino_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha?: string
          fecha_estimada?: string | null
          id?: string
          monto_estimado: number | null
          nota: string | null
          proveedor: string
          proveedor_id: string | null
          sede_destino_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: string
          fecha?: string
          fecha_estimada?: string | null
          id?: string
          monto_estimado?: number | null
          nota?: string | null
          proveedor?: string
          proveedor_id?: string | null
          sede_destino_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_sede_destino_id_fkey"
            columns: ["sede_destino_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_compra_items: {
        Row: {
          cantidad: number
          costo_unitario: number
          id: string
          orden_id: string
          variante_id: string
        }
        Insert: {
          cantidad: number
          costo_unitario: number
          id?: string
          orden_id: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          id?: string
          orden_id?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_items_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_items_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_produccion: {
        Row: {
          cantidad_planeada: number
          cantidad_producida: number
          created_at: string
          estado: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          sede_id: string
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad_planeada: number
          cantidad_producida?: number
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          sede_id: string
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad_planeada?: number
          cantidad_producida?: number
          created_at?: string
          estado?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          sede_id?: string
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_produccion_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_produccion_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "variantes"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          rol: string
          sede_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          rol: string
          sede_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          auth_user_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          rol?: string
          sede_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      patrimonio_items: {
        Row: {
          created_at: string
          id: string
          monto: number
          nombre: string
          nota: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monto?: number
          nombre: string
          nota?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monto?: number
          nombre?: string
          nota?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      productos: {
        Row: {
          categoria_id: string | null
          created_at: string
          descripcion: string | null
          estado: string
          foto_url: string | null
          genero: string | null
          id: string
          marca: string | null
          referencia: string
          sku_padre: string
          temporada: string | null
          updated_at: string
        }
        Insert: {
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          foto_url?: string | null
          genero?: string | null
          id?: string
          marca?: string | null
          referencia: string
          sku_padre: string
          temporada?: string | null
          updated_at?: string
        }
        Update: {
          categoria_id?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string
          foto_url?: string | null
          genero?: string | null
          id?: string
          marca?: string | null
          referencia?: string
          sku_padre?: string
          temporada?: string | null
          updated_at?: string
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
      proveedores: {
        Row: {
          activo: boolean
          banco: string | null
          categoria: string | null
          contacto: string | null
          created_at: string
          cuenta_bancaria: string | null
          direccion: string | null
          id: string
          marca: string | null
          nombre: string
          nota: string | null
          ruc: string | null
          score: number | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          banco?: string | null
          categoria?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          direccion?: string | null
          id?: string
          marca?: string | null
          nombre: string
          nota?: string | null
          ruc?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          banco?: string | null
          categoria?: string | null
          contacto?: string | null
          created_at?: string
          cuenta_bancaria?: string | null
          direccion?: string | null
          id?: string
          marca?: string | null
          nombre?: string
          nota?: string | null
          ruc?: string | null
          score?: number | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sedes: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
          tienda_asociada_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          tienda_asociada_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          tienda_asociada_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sedes_tienda_asociada_id_fkey"
            columns: ["tienda_asociada_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          cantidad: number
          contenedor_id: string | null
          sede_id: string
          stock_minimo: number | null
          ultima_entrada: string | null
          ultima_salida: string | null
          ultima_venta: string | null
          updated_at: string
          variante_id: string
        }
        Insert: {
          cantidad?: number
          contenedor_id?: string | null
          sede_id: string
          stock_minimo?: number | null
          ultima_entrada?: string | null
          ultima_salida?: string | null
          ultima_venta?: string | null
          updated_at?: string
          variante_id: string
        }
        Update: {
          cantidad?: number
          contenedor_id?: string | null
          sede_id?: string
          stock_minimo?: number | null
          ultima_entrada?: string | null
          ultima_salida?: string | null
          ultima_venta?: string | null
          updated_at?: string
          variante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_contenedor_id_fkey"
            columns: ["contenedor_id"]
            isOneToOne: false
            referencedRelation: "contenedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
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
      variantes: {
        Row: {
          color: string | null
          costo: number
          created_at: string
          foto_url: string | null
          id: string
          precio: number
          precio_oferta: number | null
          producto_id: string
          sku: string
          stock_minimo: number
          talla: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          producto_id: string
          sku: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          costo?: number
          created_at?: string
          foto_url?: string | null
          id?: string
          precio?: number
          precio_oferta?: number | null
          producto_id?: string
          sku?: string
          stock_minimo?: number
          talla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "variantes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas_historicas_mensuales: {
        Row: {
          anio: number
          id: string
          mes: number
          monto: number
          sede_id: string
        }
        Insert: {
          anio: number
          id?: string
          mes: number
          monto?: number
          sede_id: string
        }
        Update: {
          anio?: number
          id?: string
          mes?: number
          monto?: number
          sede_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ventas_historicas_mensuales_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          caja_id: string
          created_at: string
          id: string
          metodo_pago: string
          monto_total: number
          nota: string | null
          sede_id: string
          usuario_id: string | null
        }
        Insert: {
          caja_id: string
          created_at?: string
          id?: string
          metodo_pago: string
          monto_total: number
          nota?: string | null
          sede_id: string
          usuario_id?: string | null
        }
        Update: {
          caja_id?: string
          created_at?: string
          id?: string
          metodo_pago?: string
          monto_total?: number
          nota?: string | null
          sede_id?: string
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
            foreignKeyName: "ventas_sede_id_fkey"
            columns: ["sede_id"]
            isOneToOne: false
            referencedRelation: "sedes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      abrir_caja: {
        Args: { p_monto_apertura: number; p_sede_id: string }
        Returns: string
      }
      fn_aplicar_movimiento: {
        Args: { p_movimiento_id: string }
        Returns: undefined
      }
      fn_es_lider: { Args: never; Returns: boolean }
      fn_persona_actual: {
        Args: never
        Returns: {
          activo: boolean
          auth_user_id: string | null
          created_at: string
          id: string
          nombre: string
          rol: string
          sede_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "personas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_sede_actual_persona: { Args: never; Returns: string }
      cerrar_caja: {
        Args: { p_caja_id: string; p_monto_contado: number }
        Returns: { diferencia: number; monto_contado: number; monto_esperado: number }[]
      }
      recalcular_stock: { Args: never; Returns: undefined }
      fijar_stock_minimo: {
        Args: {
          p_minimo?: number
          p_sede_id: string
          p_variante_id: string
        }
        Returns: undefined
      }
      registrar_deposito: {
        Args: {
          p_fecha?: string
          p_monto: number
          p_nota?: string
          p_sede_id: string
        }
        Returns: string
      }
      registrar_gasto: {
        Args: {
          p_categoria: string
          p_especificacion?: string
          p_igv: number
          p_metodo_pago?: string
          p_sede_id: string
          p_subtotal: number
          p_total: number
        }
        Returns: string
      }
      recibir_lote: {
        Args: {
          p_items: Json
          p_nota?: string
          p_numero_guia?: string
          p_orden_compra_id?: string
          p_origen: string
          p_proveedor?: string
          p_sede_id: string
        }
        Returns: string
      }
      registrar_movimiento: {
        Args: {
          p_canal?: string
          p_cantidad: number
          p_contenedor_id?: string
          p_lote_id?: string
          p_monto?: number
          p_motivo?: string
          p_nota?: string
          p_sede_destino_id?: string
          p_sede_id: string
          p_tipo: string
          p_variante_id: string
          p_venta_id?: string
        }
        Returns: string
      }
      registrar_venta: {
        Args: {
          p_caja_id: string
          p_items: Json
          p_metodo_pago: string
          p_nota?: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
