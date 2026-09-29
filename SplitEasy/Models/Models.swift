import Foundation

struct Profile: Codable, Identifiable, Hashable {
    let id: UUID
    var displayName: String
    var isDeleted: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case displayName = "display_name"
        case isDeleted = "is_deleted"
    }
}

/// Named `ExpenseGroup` to avoid clashing with SwiftUI's `Group`.
struct ExpenseGroup: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var inviteCode: String
    var createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name
        case inviteCode = "invite_code"
        case createdAt = "created_at"
    }
}

struct ExpenseSplit: Codable, Hashable {
    let userId: UUID
    let amountCents: Int

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case amountCents = "amount_cents"
    }
}

struct Expense: Codable, Identifiable, Hashable {
    let id: UUID
    let groupId: UUID
    var description: String
    var amountCents: Int
    var paidBy: UUID
    var createdAt: Date
    var splits: [ExpenseSplit]
    /// The reviewed Smart Split breakdown; nil for manually entered expenses.
    var splitDetails: SmartSplitDraft? = nil

    enum CodingKeys: String, CodingKey {
        case id, description, splits
        case groupId = "group_id"
        case amountCents = "amount_cents"
        case paidBy = "paid_by"
        case createdAt = "created_at"
        case splitDetails = "split_details"
    }
}

struct Settlement: Codable, Identifiable, Hashable {
    let id: UUID
    let groupId: UUID
    let fromUser: UUID
    let toUser: UUID
    let amountCents: Int
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case groupId = "group_id"
        case fromUser = "from_user"
        case toUser = "to_user"
        case amountCents = "amount_cents"
        case createdAt = "created_at"
    }
}
