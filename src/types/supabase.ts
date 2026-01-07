export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            customers: {
                Row: {
                    id: string
                    name: string
                    phone: string | null
                    is_active: boolean
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    phone?: string | null
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    phone?: string | null
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            products: {
                Row: {
                    id: string
                    name: string
                    unit: string
                    category: string | null
                    is_active: boolean
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    unit: string
                    category?: string | null
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    unit?: string
                    category?: string | null
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            suppliers: {
                Row: {
                    id: string
                    name: string
                    is_active: boolean
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    name: string
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    name?: string
                    is_active?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            transactions: {
                Row: {
                    id: string
                    customer_id: string
                    product_id: string
                    quantity: number
                    sell_price: number
                    buy_price: number
                    date: string
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    customer_id: string
                    product_id: string
                    quantity: number
                    sell_price: number
                    buy_price: number
                    date: string
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    customer_id?: string
                    product_id?: string
                    quantity?: number
                    sell_price?: number
                    buy_price?: number
                    date?: string
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            expenses: {
                Row: {
                    id: string
                    title: string
                    amount: number
                    date: string
                    is_ghee_ingredient: boolean
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    title: string
                    amount: number
                    date: string
                    is_ghee_ingredient?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    title?: string
                    amount?: number
                    date?: string
                    is_ghee_ingredient?: boolean
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            expense_presets: {
                Row: {
                    id: string
                    label: string
                    created_at: string
                    deleted_at: string | null
                }
                Insert: {
                    id?: string
                    label: string
                    created_at?: string
                    deleted_at?: string | null
                }
                Update: {
                    id?: string
                    label?: string
                    created_at?: string
                    deleted_at?: string | null
                }
            }
            accounts_payable: {
                Row: {
                    id: string
                    supplier_id: string
                    amount: number
                    due_date: string
                    note: string | null
                    status: string
                    recorded_at: string
                }
                Insert: {
                    id?: string
                    supplier_id: string
                    amount: number
                    due_date: string
                    note?: string | null
                    status?: string
                    recorded_at?: string
                }
                Update: {
                    id?: string
                    supplier_id?: string
                    amount?: number
                    due_date?: string
                    note?: string | null
                    status?: string
                    recorded_at?: string
                }
            }
            payment_reminders: {
                Row: {
                    id: string
                    customer_id: string
                    amount: number
                    due_date: string
                    note: string | null
                    status: string
                    recorded_at: string
                }
                Insert: {
                    id?: string
                    customer_id: string
                    amount: number
                    due_date: string
                    note?: string | null
                    status?: string
                    recorded_at?: string
                }
                Update: {
                    id?: string
                    customer_id?: string
                    amount?: number
                    due_date?: string
                    note?: string | null
                    status?: string
                    recorded_at?: string
                }
            }
        }
    }
}
