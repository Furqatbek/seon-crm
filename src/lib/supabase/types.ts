
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "attendance": {
                  Row: {
                    "created_at": string,"id": string,"lesson_id": string,"marked_at": string,"marked_by": string | null,"note": string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"lesson_id": string,"marked_at"?: string,"marked_by"?: string | null,"note"?: string | null,"status": Database["public"]['Enums']["attendance_status"],"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"lesson_id"?: string,"marked_at"?: string,"marked_by"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["attendance_status"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_marked_by_fkey"
      columns: ["marked_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "attendance_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"centre_settings": {
                  Row: {
                    "billing_day": number,"centre_name": string,"created_at": string,"due_day": number,"id": string,"lesson_reminder_hours": number,"quiet_from": string,"quiet_to": string,"reminders_enabled": boolean,"singleton": boolean,"telegram_bot_username": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "billing_day"?: number,"centre_name": string,"created_at"?: string,"due_day"?: number,"id"?: string,"lesson_reminder_hours"?: number,"quiet_from"?: string,"quiet_to"?: string,"reminders_enabled"?: boolean,"singleton"?: boolean,"telegram_bot_username"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "billing_day"?: number,"centre_name"?: string,"created_at"?: string,"due_day"?: number,"id"?: string,"lesson_reminder_hours"?: number,"quiet_from"?: string,"quiet_to"?: string,"reminders_enabled"?: boolean,"singleton"?: boolean,"telegram_bot_username"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"charges": {
                  Row: {
                    "amount": number,"archived_at": string | null,"base_amount": number,"billing_month": string,"created_at": string,"created_by": string | null,"discount_amount": number,"enrollment_id": string | null,"group_id": string | null,"id": string,"is_prorated": boolean,"lessons_counted": number | null,"lessons_in_month": number | null,"note": string | null,"student_id": string,"type": Database["public"]['Enums']["charge_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"archived_at"?: string | null,"base_amount"?: number,"billing_month": string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"enrollment_id"?: string | null,"group_id"?: string | null,"id"?: string,"is_prorated"?: boolean,"lessons_counted"?: number | null,"lessons_in_month"?: number | null,"note"?: string | null,"student_id": string,"type": Database["public"]['Enums']["charge_type"]
                  }
                  Update: {
                    "amount"?: number,"archived_at"?: string | null,"base_amount"?: number,"billing_month"?: string,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"enrollment_id"?: string | null,"group_id"?: string | null,"id"?: string,"is_prorated"?: boolean,"lessons_counted"?: number | null,"lessons_in_month"?: number | null,"note"?: string | null,"student_id"?: string,"type"?: Database["public"]['Enums']["charge_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "charges_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_enrollment_id_fkey"
      columns: ["enrollment_id"]
isOneToOne: false
      referencedRelation: "enrollments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "charges_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"coin_transactions": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"group_id": string | null,"id": string,"reason": string | null,"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"id"?: string,"reason"?: string | null,"student_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"group_id"?: string | null,"id"?: string,"reason"?: string | null,"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coin_transactions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_transactions_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_transactions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "coin_transactions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coin_transactions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "coin_transactions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"enrollments": {
                  Row: {
                    "created_at": string,"discount_kind": string | null,"discount_value": number | null,"group_id": string,"id": string,"joined_on": string,"left_on": string | null,"note": string | null,"status": Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discount_kind"?: string | null,"discount_value"?: number | null,"group_id": string,"id"?: string,"joined_on": string,"left_on"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"discount_kind"?: string | null,"discount_value"?: number | null,"group_id"?: string,"id"?: string,"joined_on"?: string,"left_on"?: string | null,"note"?: string | null,"status"?: Database["public"]['Enums']["enrollment_status"],"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "enrollments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "enrollments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"archived_at": string | null,"category": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string | null,"id": string,"note": string | null,"spent_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"archived_at"?: string | null,"category": Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"spent_on": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"archived_at"?: string | null,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string | null,"spent_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"group_fee_history": {
                  Row: {
                    "created_at": string,"created_by": string | null,"effective_month": string,"group_id": string,"id": string,"monthly_fee": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"effective_month": string,"group_id": string,"id"?: string,"monthly_fee": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"effective_month"?: string,"group_id"?: string,"id"?: string,"monthly_fee"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_fee_history_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_fee_history_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"capacity": number | null,"created_at": string,"days": (number)[],"duration_min": number,"end_date": string | null,"id": string,"level": string | null,"monthly_fee": number,"name": string,"room_id": string | null,"start_date": string,"start_time": string,"status": Database["public"]['Enums']["group_status"],"subject": string,"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"days": (number)[],"duration_min"?: number,"end_date"?: string | null,"id"?: string,"level"?: string | null,"monthly_fee": number,"name": string,"room_id"?: string | null,"start_date": string,"start_time": string,"status"?: Database["public"]['Enums']["group_status"],"subject": string,"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number | null,"created_at"?: string,"days"?: (number)[],"duration_min"?: number,"end_date"?: string | null,"id"?: string,"level"?: string | null,"monthly_fee"?: number,"name"?: string,"room_id"?: string | null,"start_date"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["group_status"],"subject"?: string,"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "groups_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_activities": {
                  Row: {
                    "body": string | null,"created_at": string,"created_by": string | null,"from_status": Database["public"]['Enums']["lead_status"] | null,"id": string,"kind": string,"lead_id": string,"to_status": Database["public"]['Enums']["lead_status"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["lead_status"] | null,"id"?: string,"kind": string,"lead_id": string,"to_status"?: Database["public"]['Enums']["lead_status"] | null
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"created_by"?: string | null,"from_status"?: Database["public"]['Enums']["lead_status"] | null,"id"?: string,"kind"?: string,"lead_id"?: string,"to_status"?: Database["public"]['Enums']["lead_status"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "archived_at": string | null,"assigned_to": string | null,"converted_student_id": string | null,"created_at": string,"created_by": string | null,"full_name": string,"id": string,"lost_reason": string | null,"next_contact_at": string | null,"notes": string | null,"phone": string,"preferred_time": string | null,"referred_by_student_id": string | null,"source": Database["public"]['Enums']["lead_source"],"status": Database["public"]['Enums']["lead_status"],"subject_interest": string | null,"trial_date": string | null,"trial_group_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"assigned_to"?: string | null,"converted_student_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name": string,"id"?: string,"lost_reason"?: string | null,"next_contact_at"?: string | null,"notes"?: string | null,"phone": string,"preferred_time"?: string | null,"referred_by_student_id"?: string | null,"source": Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"subject_interest"?: string | null,"trial_date"?: string | null,"trial_group_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"assigned_to"?: string | null,"converted_student_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"full_name"?: string,"id"?: string,"lost_reason"?: string | null,"next_contact_at"?: string | null,"notes"?: string | null,"phone"?: string,"preferred_time"?: string | null,"referred_by_student_id"?: string | null,"source"?: Database["public"]['Enums']["lead_source"],"status"?: Database["public"]['Enums']["lead_status"],"subject_interest"?: string | null,"trial_date"?: string | null,"trial_group_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "leads_converted_student_id_fkey"
      columns: ["converted_student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_referred_by_student_id_fkey"
      columns: ["referred_by_student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "leads_referred_by_student_id_fkey"
      columns: ["referred_by_student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_referred_by_student_id_fkey"
      columns: ["referred_by_student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "leads_referred_by_student_id_fkey"
      columns: ["referred_by_student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_trial_group_id_fkey"
      columns: ["trial_group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "cancel_reason": string | null,"created_at": string,"group_id": string,"id": string,"lesson_date": string,"start_time": string,"status": Database["public"]['Enums']["lesson_status"],"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_reason"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"lesson_date": string,"start_time": string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "cancel_reason"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"lesson_date"?: string,"start_time"?: string,"status"?: Database["public"]['Enums']["lesson_status"],"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"message_templates": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"id": string,"language": Database["public"]['Enums']["app_language"],"type": Database["public"]['Enums']["message_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at"?: string,"id"?: string,"language": Database["public"]['Enums']["app_language"],"type": Database["public"]['Enums']["message_type"],"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"type"?: Database["public"]['Enums']["message_type"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"dedupe_key": string | null,"error": string | null,"id": string,"recipient": string,"sent_at": string | null,"status": Database["public"]['Enums']["message_status"],"student_id": string,"type": Database["public"]['Enums']["message_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"recipient": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"student_id": string,"type": Database["public"]['Enums']["message_type"]
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"dedupe_key"?: string | null,"error"?: string | null,"id"?: string,"recipient"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"student_id"?: string,"type"?: Database["public"]['Enums']["message_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "messages_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"archived_at": string | null,"created_at": string,"group_id": string,"id": string,"method": Database["public"]['Enums']["payment_method"],"note": string | null,"paid_at": string,"receipt_no": number,"received_by": string | null,"student_id": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"archived_at"?: string | null,"created_at"?: string,"group_id": string,"id"?: string,"method": Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at"?: string,"receipt_no"?: never,"received_by"?: string | null,"student_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"archived_at"?: string | null,"created_at"?: string,"group_id"?: string,"id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"note"?: string | null,"paid_at"?: string,"receipt_no"?: never,"received_by"?: string | null,"student_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_received_by_fkey"
      columns: ["received_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "payments_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"point_presets": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["preset_kind"],"label_en": string,"label_ru": string,"label_uz": string,"points": number,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["preset_kind"],"label_en": string,"label_ru": string,"label_uz": string,"points": number,"sort"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["preset_kind"],"label_en"?: string,"label_ru"?: string,"label_uz"?: string,"points"?: number,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"points_ledger": {
                  Row: {
                    "created_at": string,"created_by": string | null,"dedupe_key": string | null,"delta": number,"group_id": string | null,"id": string,"lesson_id": string | null,"preset_id": string | null,"reason": string | null,"redemption_id": string | null,"source": Database["public"]['Enums']["points_source"],"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"delta": number,"group_id"?: string | null,"id"?: string,"lesson_id"?: string | null,"preset_id"?: string | null,"reason"?: string | null,"redemption_id"?: string | null,"source": Database["public"]['Enums']["points_source"],"student_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"dedupe_key"?: string | null,"delta"?: number,"group_id"?: string | null,"id"?: string,"lesson_id"?: string | null,"preset_id"?: string | null,"reason"?: string | null,"redemption_id"?: string | null,"source"?: Database["public"]['Enums']["points_source"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "points_ledger_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_preset_id_fkey"
      columns: ["preset_id"]
isOneToOne: false
      referencedRelation: "point_presets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_redemption_id_fkey"
      columns: ["redemption_id"]
isOneToOne: false
      referencedRelation: "redemptions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "points_ledger_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "points_ledger_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"points_settings": {
                  Row: {
                    "created_at": string,"enabled": boolean,"id": string,"late": number,"max_per_action": number,"on_time": number,"perfect_month": number,"perfect_month_min_lessons": number,"present": number,"referral": number,"singleton": boolean,"started_at": string,"teacher_daily_cap": number,"tv_language": Database["public"]['Enums']["app_language"],"tv_token": string,"updated_at": string,"weekly_day": number,"weekly_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: string,"late"?: number,"max_per_action"?: number,"on_time"?: number,"perfect_month"?: number,"perfect_month_min_lessons"?: number,"present"?: number,"referral"?: number,"singleton"?: boolean,"started_at"?: string,"teacher_daily_cap"?: number,"tv_language"?: Database["public"]['Enums']["app_language"],"tv_token"?: string,"updated_at"?: string,"weekly_day"?: number,"weekly_time"?: string
                  }
                  Update: {
                    "created_at"?: string,"enabled"?: boolean,"id"?: string,"late"?: number,"max_per_action"?: number,"on_time"?: number,"perfect_month"?: number,"perfect_month_min_lessons"?: number,"present"?: number,"referral"?: number,"singleton"?: boolean,"started_at"?: string,"teacher_daily_cap"?: number,"tv_language"?: Database["public"]['Enums']["app_language"],"tv_token"?: string,"updated_at"?: string,"weekly_day"?: number,"weekly_time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"full_name": string,"id": string,"is_active": boolean,"language": Database["public"]['Enums']["app_language"],"role": Database["public"]['Enums']["user_role"],"teacher_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"language"?: Database["public"]['Enums']["app_language"],"role"?: Database["public"]['Enums']["user_role"],"teacher_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"language"?: Database["public"]['Enums']["app_language"],"role"?: Database["public"]['Enums']["user_role"],"teacher_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"redemptions": {
                  Row: {
                    "cost": number,"created_at": string,"created_by": string | null,"handled_at": string | null,"handled_by": string | null,"id": string,"note": string | null,"requested_by": string,"reward_id": string,"status": Database["public"]['Enums']["redemption_status"],"student_id": string,"via": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost": number,"created_at"?: string,"created_by"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"note"?: string | null,"requested_by": string,"reward_id": string,"status"?: Database["public"]['Enums']["redemption_status"],"student_id": string,"via": string
                  }
                  Update: {
                    "cost"?: number,"created_at"?: string,"created_by"?: string | null,"handled_at"?: string | null,"handled_by"?: string | null,"id"?: string,"note"?: string | null,"requested_by"?: string,"reward_id"?: string,"status"?: Database["public"]['Enums']["redemption_status"],"student_id"?: string,"via"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "redemptions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_handled_by_fkey"
      columns: ["handled_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_reward_id_fkey"
      columns: ["reward_id"]
isOneToOne: false
      referencedRelation: "rewards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "redemptions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "redemptions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "redemptions_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                },"rewards": {
                  Row: {
                    "archived_at": string | null,"cost": number,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"photo_path": string | null,"stock": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"cost": number,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"photo_path"?: string | null,"stock"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"cost"?: number,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"photo_path"?: string | null,"stock"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rooms": {
                  Row: {
                    "archived_at": string | null,"capacity": number,"created_at": string,"id": string,"is_active": boolean,"name": string | null,"number": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"capacity": number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string | null,"number": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"capacity"?: number,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string | null,"number"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"students": {
                  Row: {
                    "archived_at": string | null,"birth_date": string | null,"created_at": string,"full_name": string,"id": string,"language": Database["public"]['Enums']["app_language"],"lead_id": string | null,"leaderboard_hidden": boolean,"notes": string | null,"parent_link_code": string,"parent_name": string | null,"parent_phone": string | null,"phone": string,"status": Database["public"]['Enums']["student_status"],"student_link_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"created_at"?: string,"full_name": string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"lead_id"?: string | null,"leaderboard_hidden"?: boolean,"notes"?: string | null,"parent_link_code"?: string,"parent_name"?: string | null,"parent_phone"?: string | null,"phone": string,"status"?: Database["public"]['Enums']["student_status"],"student_link_code"?: string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"birth_date"?: string | null,"created_at"?: string,"full_name"?: string,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"lead_id"?: string | null,"leaderboard_hidden"?: boolean,"notes"?: string | null,"parent_link_code"?: string,"parent_name"?: string | null,"parent_phone"?: string | null,"phone"?: string,"status"?: Database["public"]['Enums']["student_status"],"student_link_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "students_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_pay_rates": {
                  Row: {
                    "amount": number | null,"created_at": string,"effective_from": string,"id": string,"pay_type": Database["public"]['Enums']["pay_type"],"percent": number | null,"teacher_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"created_at"?: string,"effective_from": string,"id"?: string,"pay_type": Database["public"]['Enums']["pay_type"],"percent"?: number | null,"teacher_id": string
                  }
                  Update: {
                    "amount"?: number | null,"created_at"?: string,"effective_from"?: string,"id"?: string,"pay_type"?: Database["public"]['Enums']["pay_type"],"percent"?: number | null,"teacher_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_pay_rates_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teacher_payouts": {
                  Row: {
                    "archived_at": string | null,"basis": number,"bonus": number,"breakdown": NonNullable<Json>,"calculated": number,"created_at": string,"deduction": number,"final_amount": number,"id": string,"month": string,"note": string | null,"paid_at": string | null,"paid_by": string | null,"pay_type": Database["public"]['Enums']["pay_type"],"rate": number,"status": Database["public"]['Enums']["payout_status"],"teacher_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"basis"?: number,"bonus"?: number,"breakdown"?: NonNullable<Json>,"calculated"?: number,"created_at"?: string,"deduction"?: number,"final_amount": number,"id"?: string,"month": string,"note"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"pay_type": Database["public"]['Enums']["pay_type"],"rate": number,"status"?: Database["public"]['Enums']["payout_status"],"teacher_id": string,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"basis"?: number,"bonus"?: number,"breakdown"?: NonNullable<Json>,"calculated"?: number,"created_at"?: string,"deduction"?: number,"final_amount"?: number,"id"?: string,"month"?: string,"note"?: string | null,"paid_at"?: string | null,"paid_by"?: string | null,"pay_type"?: Database["public"]['Enums']["pay_type"],"rate"?: number,"status"?: Database["public"]['Enums']["payout_status"],"teacher_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "teacher_payouts_paid_by_fkey"
      columns: ["paid_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teacher_payouts_teacher_id_fkey"
      columns: ["teacher_id"]
isOneToOne: false
      referencedRelation: "teachers"
      referencedColumns: ["id"]
    }
                  ]
                },"teachers": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"full_name": string,"hired_on": string | null,"id": string,"is_active": boolean,"notes": string | null,"phone": string,"subjects": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"full_name": string,"hired_on"?: string | null,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"phone": string,"subjects"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"full_name"?: string,"hired_on"?: string | null,"id"?: string,"is_active"?: boolean,"notes"?: string | null,"phone"?: string,"subjects"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"telegram_links": {
                  Row: {
                    "chat_id": number,"id": string,"language": Database["public"]['Enums']["app_language"],"linked_at": string,"role": Database["public"]['Enums']["link_role"],"student_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chat_id": number,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"linked_at"?: string,"role": Database["public"]['Enums']["link_role"],"student_id": string
                  }
                  Update: {
                    "chat_id"?: number,"id"?: string,"language"?: Database["public"]['Enums']["app_language"],"linked_at"?: string,"role"?: Database["public"]['Enums']["link_role"],"student_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "telegram_links_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_balances"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "telegram_links_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_overview"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "telegram_links_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "student_points"
      referencedColumns: ["student_id"]
    },{
      foreignKeyName: "telegram_links_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "students"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "student_balances": {
                  Row: {
                    "balance": number | null,"charged": number | null,"oldest_unpaid_month": string | null,"paid": number | null,"student_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                },"student_overview": {
                  Row: {
                    "archived_at": string | null,"balance": number | null,"birth_date": string | null,"charged": number | null,"created_at": string,"full_name": string,"id": string,"language": Database["public"]['Enums']["app_language"],"lead_id": string | null,"leaderboard_hidden": boolean,"notes": string | null,"oldest_unpaid_month": string | null,"paid": number | null,"parent_link_code": string,"parent_name": string | null,"parent_phone": string | null,"phone": string,"status": Database["public"]['Enums']["student_status"],"student_link_code": string,"telegram_linked": boolean | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "students_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    }
                  ]
                },"student_points": {
                  Row: {
                    "balance": number | null,"earned_all_time": number | null,"earned_this_month": number | null,"student_id": string
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "activate_started_groups":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"add_coins":
{ Args: { "p_amount": number,"p_group_id": string,"p_reason"?: string,"p_student_id": string }; Returns: number
                           },
"adjust_points":
{ Args: { "p_delta": number,"p_group_id"?: string,"p_reason": string,"p_student_id": string }; Returns: number
                           },
"app_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"attendance_is_editable":
{ Args: { "p_lesson_id": string }; Returns: boolean
                           },
"award_points":
{ Args: { "p_group_id": string,"p_lesson_id"?: string,"p_points": number,"p_preset_id"?: string,"p_reason"?: string,"p_student_id": string }; Returns: {
              "applied": number,"balance": number,"ledger_id": string
            }[]
                           },
"bot_top":
{ Args: { "p_student_id": string }; Returns: Json
                           },
"calculate_teacher_payouts":
{ Args: { "p_month": string }; Returns: number
                           },
"call_reminders_job":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"centre_name":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"convert_lead_to_student":
{ Args: { "p_birth_date"?: string,"p_full_name": string,"p_language"?: Database["public"]['Enums']["app_language"],"p_lead_id": string,"p_notes"?: string,"p_parent_name"?: string,"p_parent_phone"?: string,"p_phone": string }; Returns: string
                           },
"discount_amount":
{ Args: { "p_fee": number,"p_kind": string,"p_value": number }; Returns: number
                           },
"enrol_student":
{ Args: { "p_charge_mode"?: string,"p_charge_note"?: string,"p_custom_amount"?: number,"p_discount_kind"?: string,"p_discount_value"?: number,"p_group_id": string,"p_joined_on": string,"p_note"?: string,"p_student_id": string }; Returns: string
                           },
"finance_month_summary":
{ Args: { "p_month": string }; Returns: {
              "billed": number,"collected": number,"debt": number,"expenses": number
            }[]
                           },
"generate_all_lessons":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"generate_lessons":
{ Args: { "p_from": string,"p_group_id": string,"p_to": string }; Returns: number
                           },
"generate_link_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"generate_monthly_charges":
{ Args: { "p_month": string }; Returns: number
                           },
"group_coins":
{ Args: { "p_group_id": string }; Returns: {
              "balance": number,"earned": number,"full_name": string,"rank": number,"student_id": string
            }[]
                           },
"group_fee_for":
{ Args: { "p_group_id": string,"p_month": string }; Returns: number
                           },
"group_month_points":
{ Args: { "p_group_id": string }; Returns: {
              "points": number,"student_id": string
            }[]
                           },
"group_uses_room":
{ Args: { "p_archived_at": string,"p_status": Database["public"]['Enums']["group_status"] }; Returns: boolean
                           },
"handle_redemption":
{ Args: { "p_action": string,"p_id": string,"p_note"?: string }; Returns: Database["public"]['Enums']["redemption_status"]
                           },
"is_api_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_user_request":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"leaderboard":
{ Args: { "p_group_id"?: string,"p_month"?: string,"p_period"?: string,"p_scope": string }; Returns: {
              "display_name": string,"hidden": boolean,"points": number,"rank": number,"student_id": string
            }[]
                           },
"leaderboard_rows":
{ Args: { "p_group_id": string,"p_month": string,"p_period": string,"p_scope": string }; Returns: {
              "full_name": string,"hidden": boolean,"points": number,"rank": number,"student_id": string
            }[]
                           },
"leave_group":
{ Args: { "p_credit_amount"?: number,"p_credit_note"?: string,"p_enrollment_id": string,"p_left_on": string }; Returns: undefined
                           },
"lesson_horizon":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"list_adjustments":
{ Args: { "p_limit"?: number,"p_month": string,"p_offset"?: number }; Returns: {
              "amount": number,"by_name": string,"group_name": string,"happened_at": string,"kind": string,"reason": string,"receipt_no": number,"student_id": string,"student_name": string,"total": number
            }[]
                           },
"list_debtors":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: {
              "balance": number,"full_name": string,"groups": Json,"last_payment_at": string,"oldest_unpaid_month": string,"phone": string,"student_id": string,"total": number
            }[]
                           },
"mark_student_graduated":
{ Args: { "p_student_id": string }; Returns: undefined
                           },
"mark_student_left":
{ Args: { "p_student_id": string }; Returns: undefined
                           },
"my_teacher_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"notify_debtors":
{ Args: Record<PropertyKey, never>; Returns: {
              "charged_months": (string)[],"debt": number,"full_name": string,"language": Database["public"]['Enums']["app_language"],"parent_chat_id": number,"parent_chat_language": Database["public"]['Enums']["app_language"],"parent_phone": string,"phone": string,"student_id": string
            }[]
                           },
"notify_lessons":
{ Args: { "p_days": (string)[] }; Returns: {
              "full_name": string,"group_name": string,"language": Database["public"]['Enums']["app_language"],"lesson_date": string,"lesson_id": string,"parent_chat_id": number,"parent_chat_language": Database["public"]['Enums']["app_language"],"start_time": string,"student_chat_id": number,"student_chat_language": Database["public"]['Enums']["app_language"],"student_id": string
            }[]
                           },
"points_daily":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"points_enabled":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"points_post_on_time":
{ Args: { "p_month": string }; Returns: number
                           },
"points_post_perfect_month":
{ Args: { "p_month": string }; Returns: number
                           },
"points_summary":
{ Args: { "p_month"?: string,"p_student_id": string }; Returns: Json
                           },
"points_sync_attendance":
{ Args: { "p_lesson_id": string,"p_student_id": string }; Returns: undefined
                           },
"points_tv_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"preview_monthly_charges":
{ Args: { "p_month": string }; Returns: {
              "amount": number,"base_amount": number,"discount_amount": number,"enrollment_id": string,"group_id": string,"group_name": string,"student_id": string,"student_name": string
            }[]
                           },
"preview_monthly_charges_summary":
{ Args: { "p_month": string }; Returns: {
              "charges": number,"total": number
            }[]
                           },
"propose_first_charge":
{ Args: { "p_discount_kind"?: string,"p_discount_value"?: number,"p_group_id": string,"p_joined_on": string }; Returns: {
              "amount": number,"base_amount": number,"billing_month": string,"discount_amount": number,"full_amount": number,"is_prorated": boolean,"lessons_counted": number,"lessons_in_month": number
            }[]
                           },
"rebuild_future_lessons":
{ Args: { "p_group_id": string }; Returns: number
                           },
"regenerate_tv_token":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"report_active_students":
{ Args: { "p_day": string }; Returns: number
                           },
"report_attendance":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "absent": number,"excused": number,"group_id": string,"group_name": string,"late": number,"present": number,"rate": number
            }[]
                           },
"report_check_period":
{ Args: { "p_from": string,"p_to": string }; Returns: undefined
                           },
"report_collected_vs_expenses":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "collected": number,"costs": number,"expenses": number,"month": string,"salaries": number
            }[]
                           },
"report_debt_age":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount": number,"bucket": string,"students": number
            }[]
                           },
"report_ends":
{ Args: { "p_to": string }; Returns: string
                           },
"report_kpis":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "active_students": number,"attendance_rate": number,"collected": number,"costs": number,"expenses": number,"lead_conversion": number,"new_leads": number,"profit": number,"salaries": number,"total_debt": number,"won_leads": number
            }[]
                           },
"report_lead_funnel":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "dimension": string,"key": string,"leads": number,"won": number
            }[]
                           },
"report_revenue":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "collected": number,"dimension": string,"name": string
            }[]
                           },
"report_starts":
{ Args: { "p_from": string }; Returns: string
                           },
"report_students":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "active": number,"joined": number,"left_count": number,"month": string
            }[]
                           },
"request_reward":
{ Args: { "p_requested_by"?: string,"p_reward_id": string,"p_student_id": string,"p_via"?: string }; Returns: string
                           },
"restore_lesson":
{ Args: { "p_lesson_id": string }; Returns: undefined
                           },
"room_clashes":
{ Args: { "p_days": (number)[],"p_duration_min": number,"p_except_group"?: string,"p_room_id": string,"p_start_time": string }; Returns: {
              "group_id": string,"group_name": string
            }[]
                           },
"round_to_thousand":
{ Args: { "denominator"?: number,"numerator": number }; Returns: number
                           },
"run_billing_day":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"save_attendance":
{ Args: { "p_lesson_id": string,"p_marks": Json }; Returns: undefined
                           },
"tashkent_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"teacher_groups":
{ Args: Record<PropertyKey, never>; Returns: {
              "days": (number)[],"duration_min": number,"id": string,"level": string,"name": string,"room_name": string,"room_number": string,"start_time": string,"status": Database["public"]['Enums']["group_status"],"students": number,"subject": string
            }[]
                           },
"teacher_lesson":
{ Args: { "p_lesson_id": string }; Returns: {
              "can_mark": boolean,"group_id": string,"lesson_date": string,"start_time": string,"status": Database["public"]['Enums']["lesson_status"]
            }[]
                           },
"teacher_lesson_sheet":
{ Args: { "p_lesson_id": string }; Returns: {
              "full_name": string,"mark": Database["public"]['Enums']["attendance_status"],"student_id": string
            }[]
                           },
"teacher_lessons":
{ Args: { "p_group_id": string }; Returns: {
              "can_mark": boolean,"id": string,"lesson_date": string,"marked": number,"start_time": string,"status": Database["public"]['Enums']["lesson_status"]
            }[]
                           },
"teacher_owns_group":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"teacher_points_history":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"delta": number,"group_name": string,"id": string,"is_undo": boolean,"preset_id": string,"reason": string,"student_name": string
            }[]
                           },
"teacher_save_attendance":
{ Args: { "p_lesson_id": string,"p_marks": Json }; Returns: undefined
                           },
"transfer_student":
{ Args: { "p_charge_mode"?: string,"p_charge_note"?: string,"p_credit_amount"?: number,"p_credit_note"?: string,"p_custom_amount"?: number,"p_discount_kind"?: string,"p_discount_value"?: number,"p_enrollment_id": string,"p_on": string,"p_to_group_id": string }; Returns: string
                           },
"tv_board":
{ Args: { "p_token": string }; Returns: Json
                           },
"tv_name":
{ Args: { "p_full_name": string }; Returns: string
                           },
"tv_token_ok":
{ Args: { "p_token": string }; Returns: boolean
                           },
"undo_points":
{ Args: { "p_ledger_id": string }; Returns: number
                           }
          }
          Enums: {
            "app_language": "uz"|"ru"|"en","attendance_status": "present"|"late"|"absent"|"excused","charge_type": "monthly_fee"|"adjustment","enrollment_status": "active"|"left","expense_category": "rent"|"utilities"|"marketing"|"supplies"|"other","group_status": "forming"|"active"|"finished","lead_source": "instagram"|"telegram"|"phone_call"|"walk_in"|"referral"|"website"|"other","lead_status": "new"|"contacted"|"trial"|"won"|"lost","lesson_status": "scheduled"|"held"|"cancelled","link_role": "student"|"parent","message_channel": "telegram"|"sms","message_status": "queued"|"sent"|"failed"|"skipped","message_type": "payment_due"|"payment_overdue"|"lesson_reminder"|"custom"|"points_weekly"|"points_deduction"|"points_month_result"|"reward_update","pay_type": "fixed_monthly"|"percent_of_revenue"|"per_lesson","payment_method": "cash"|"card"|"transfer","payout_status": "draft"|"paid","points_source": "attendance"|"perfect_month"|"on_time_payment"|"referral"|"teacher_award"|"teacher_deduction"|"owner_adjustment"|"reward_hold"|"reward_return","preset_kind": "award"|"deduction","redemption_status": "requested"|"given"|"rejected"|"cancelled","student_status": "active"|"paused"|"left"|"graduated","user_role": "owner"|"manager"|"teacher"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_language": ["uz", "ru", "en"],"attendance_status": ["present", "late", "absent", "excused"],"charge_type": ["monthly_fee", "adjustment"],"enrollment_status": ["active", "left"],"expense_category": ["rent", "utilities", "marketing", "supplies", "other"],"group_status": ["forming", "active", "finished"],"lead_source": ["instagram", "telegram", "phone_call", "walk_in", "referral", "website", "other"],"lead_status": ["new", "contacted", "trial", "won", "lost"],"lesson_status": ["scheduled", "held", "cancelled"],"link_role": ["student", "parent"],"message_channel": ["telegram", "sms"],"message_status": ["queued", "sent", "failed", "skipped"],"message_type": ["payment_due", "payment_overdue", "lesson_reminder", "custom", "points_weekly", "points_deduction", "points_month_result", "reward_update"],"pay_type": ["fixed_monthly", "percent_of_revenue", "per_lesson"],"payment_method": ["cash", "card", "transfer"],"payout_status": ["draft", "paid"],"points_source": ["attendance", "perfect_month", "on_time_payment", "referral", "teacher_award", "teacher_deduction", "owner_adjustment", "reward_hold", "reward_return"],"preset_kind": ["award", "deduction"],"redemption_status": ["requested", "given", "rejected", "cancelled"],"student_status": ["active", "paused", "left", "graduated"],"user_role": ["owner", "manager", "teacher"]
          }
        }
} as const
