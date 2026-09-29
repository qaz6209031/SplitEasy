import Foundation
import Supabase

/// All reads go through Row Level Security; all writes except deletes go through RPCs
/// defined in `supabase/migrations`.
enum GroupRepository {
    private static let expenseColumns =
        "id, group_id, description, amount_cents, paid_by, created_at, split_details, splits:expense_splits(user_id, amount_cents)"

    // MARK: Groups

    static func fetchGroups() async throws -> [ExpenseGroup] {
        try await supabase.from("groups")
            .select()
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    static func createGroup(name: String) async throws -> ExpenseGroup {
        try await supabase.rpc("create_group", params: ["p_name": name]).execute().value
    }

    static func fetchGroup(id: UUID) async throws -> ExpenseGroup {
        try await supabase.from("groups").select().eq("id", value: id).single().execute().value
    }

    /// Locks expenses and starts the final pay-back. Returns the new status ("settling", or "settled"
    /// if everyone was already even).
    static func startSettlement(groupId: UUID) async throws {
        try await supabase.rpc("start_settlement", params: ["p_group_id": groupId]).execute()
    }

    /// Unlocks the group so expenses can be changed again. Recorded payments are kept.
    static func reopenGroup(groupId: UUID) async throws {
        try await supabase.rpc("reopen_group", params: ["p_group_id": groupId]).execute()
    }

    static func joinGroup(code: String) async throws -> ExpenseGroup {
        try await supabase.rpc("join_group", params: ["p_code": code]).execute().value
    }

    /// Your net balance in every group you belong to, keyed by group id.
    static func fetchMyBalances(userId: UUID) async throws -> [UUID: Int] {
        async let expenses: [Expense] = supabase.from("expenses").select(expenseColumns).execute().value
        async let settlements: [Settlement] = supabase.from("settlements").select().execute().value
        let (allExpenses, allSettlements) = try await (expenses, settlements)

        let expensesByGroup = Dictionary(grouping: allExpenses, by: \.groupId)
        let settlementsByGroup = Dictionary(grouping: allSettlements, by: \.groupId)
        var result: [UUID: Int] = [:]
        for groupId in Set(expensesByGroup.keys).union(settlementsByGroup.keys) {
            let balances = BalanceCalculator.netBalances(
                expenses: expensesByGroup[groupId] ?? [],
                settlements: settlementsByGroup[groupId] ?? []
            )
            result[groupId] = balances[userId] ?? 0
        }
        return result
    }

    // MARK: Group detail

    static func fetchMembers(groupId: UUID) async throws -> [Profile] {
        struct Row: Decodable { let profile: Profile }
        let rows: [Row] = try await supabase.from("group_members")
            .select("profile:profiles(*)")
            .eq("group_id", value: groupId)
            .order("joined_at")
            .execute()
            .value
        return rows.map(\.profile)
    }

    static func fetchExpenses(groupId: UUID) async throws -> [Expense] {
        try await supabase.from("expenses")
            .select(expenseColumns)
            .eq("group_id", value: groupId)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    static func fetchSettlements(groupId: UUID) async throws -> [Settlement] {
        try await supabase.from("settlements")
            .select()
            .eq("group_id", value: groupId)
            .order("created_at", ascending: false)
            .execute()
            .value
    }

    // MARK: Expenses

    /// Creates the expense when `expenseId` is nil, otherwise updates it. Splits equally.
    static func saveExpense(
        expenseId: UUID?,
        groupId: UUID,
        description: String,
        amountCents: Int,
        paidBy: UUID,
        participantIds: [UUID]
    ) async throws {
        struct Params: Encodable {
            let p_expense_id: UUID?
            let p_group_id: UUID
            let p_description: String
            let p_amount_cents: Int
            let p_paid_by: UUID
            let p_participant_ids: [UUID]

            // Always send p_expense_id (as null for new expenses) so PostgREST can match the function.
            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(p_expense_id, forKey: .p_expense_id)
                try c.encode(p_group_id, forKey: .p_group_id)
                try c.encode(p_description, forKey: .p_description)
                try c.encode(p_amount_cents, forKey: .p_amount_cents)
                try c.encode(p_paid_by, forKey: .p_paid_by)
                try c.encode(p_participant_ids, forKey: .p_participant_ids)
            }

            enum CodingKeys: String, CodingKey {
                case p_expense_id, p_group_id, p_description, p_amount_cents, p_paid_by, p_participant_ids
            }
        }
        try await supabase.rpc("save_expense", params: Params(
            p_expense_id: expenseId,
            p_group_id: groupId,
            p_description: description,
            p_amount_cents: amountCents,
            p_paid_by: paidBy,
            p_participant_ids: participantIds
        )).execute()
    }

    static func deleteExpense(id: UUID) async throws {
        try await supabase.from("expenses").delete().eq("id", value: id).execute()
    }

    // MARK: Settle up

    static func recordSettlement(groupId: UUID, payment: Payment) async throws {
        struct Params: Encodable {
            let p_group_id: UUID
            let p_from_user: UUID
            let p_to_user: UUID
            let p_amount_cents: Int
        }
        try await supabase.rpc("record_settlement", params: Params(
            p_group_id: groupId,
            p_from_user: payment.from,
            p_to_user: payment.to,
            p_amount_cents: payment.amountCents
        )).execute()
    }
}
