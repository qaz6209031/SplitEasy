import Foundation
import Testing
@testable import SplitEasy

private final class BundleToken {}

/// Same schema as supabase/functions/_shared/smart-split/fixtures/calculator.json.
private struct CalculatorFixture: Decodable {
    struct Item: Decodable {
        let id: String
        let totalPriceCents: Int?
        let discountCents: Int?
        let assigned: [String]
    }

    struct Charges: Decodable {
        let taxCents: Int?
        let tipCents: Int?
        let feeCents: Int?
        let shippingCents: Int?
        let discountCents: Int?
    }

    struct Expected: Decodable {
        let shares: [String: Int]
        let subtotal: Int
        let total: Int
        let excluded: [String]
    }

    let name: String
    let participants: [String]
    let items: [Item]
    let charges: Charges
    let expected: Expected

    var draft: SmartSplitDraft {
        makeDraft(
            items: items.map {
                makeItem(id: $0.id, total: $0.totalPriceCents, discount: $0.discountCents, assigned: $0.assigned)
            },
            tax: charges.taxCents, tip: charges.tipCents, fee: charges.feeCents,
            shipping: charges.shippingCents, discount: charges.discountCents
        )
    }
}

private func loadFixtures() throws -> [CalculatorFixture] {
    let bundle = Bundle(for: BundleToken.self)
    let url = try #require(
        bundle.url(forResource: "calculator", withExtension: "json")
            ?? bundle.url(forResource: "calculator", withExtension: "json", subdirectory: "fixtures")
    )
    return try JSONDecoder().decode([CalculatorFixture].self, from: Data(contentsOf: url))
}

private func makeItem(
    id: String,
    name: String? = nil,
    total: Int?,
    discount: Int? = nil,
    assigned: [String],
    confidence: Double = 0.95
) -> SmartSplitItem {
    SmartSplitItem(
        id: id, name: name ?? id, quantity: 1, unitPriceCents: total, totalPriceCents: total, discountCents: discount,
        assignedParticipantIds: assigned, splitType: "equal", weights: nil, source: "text", confidence: confidence,
        needsPrice: total == nil, needsAssignment: assigned.isEmpty
    )
}

private func makeDraft(
    items: [SmartSplitItem],
    subtotal: Int? = nil,
    tax: Int? = nil,
    tip: Int? = nil,
    fee: Int? = nil,
    shipping: Int? = nil,
    discount: Int? = nil,
    total: Int? = nil,
    ambiguities: [SmartSplitAmbiguity] = []
) -> SmartSplitDraft {
    SmartSplitDraft(
        merchant: nil, currency: "USD", paidByParticipantId: nil, items: items, subtotalCents: subtotal,
        taxCents: tax, tipCents: tip, feeCents: fee, shippingCents: shipping, discountCents: discount,
        totalCents: total, ambiguities: ambiguities, missingInformation: [], confidence: 0.95
    )
}

@Suite struct SmartSplitCalculatorTests {
    @Test func matchesSharedFixtures() throws {
        let fixtures = try loadFixtures()
        #expect(fixtures.count >= 10)
        for fixture in fixtures {
            let result = SmartSplitCalculator.calculate(fixture.draft, participantOrder: fixture.participants)
            let shares = Dictionary(uniqueKeysWithValues: result.perParticipant.map { ($0.participantId, $0.totalCents) })
            #expect(shares == fixture.expected.shares, "\(fixture.name)")
            #expect(result.computedSubtotalCents == fixture.expected.subtotal, "\(fixture.name)")
            #expect(result.computedTotalCents == fixture.expected.total, "\(fixture.name)")
            #expect(result.excludedItemIds == fixture.expected.excluded, "\(fixture.name)")
            #expect(result.perParticipant.reduce(0) { $0 + $1.totalCents } == result.computedTotalCents, "\(fixture.name)")
        }
    }

    @Test func proportionalAllocationAlwaysReconciles() {
        let weights = ["a": 333, "b": 1, "c": 0, "d": 12345]
        for amount in stride(from: 0, to: 500, by: 7) {
            let parts = SmartSplitCalculator.allocateProportionally(amount, weights: weights, order: ["a", "b", "c", "d"])
            #expect(parts.values.reduce(0, +) == amount)
            #expect(parts["c"] == nil)
        }
    }
}

@Suite struct SmartSplitValidatorTests {
    private let order = ["kai", "john"]

    private func issues(_ draft: SmartSplitDraft) -> [SmartSplitIssue] {
        SmartSplitValidator.validate(
            draft,
            calculation: SmartSplitCalculator.calculate(draft, participantOrder: order),
            participantOrder: order
        )
    }

    @Test func blocksMissingPriceAssignmentAndAmbiguity() {
        let draft = makeDraft(
            items: [
                makeItem(id: "shampoo", name: "Shampoo", total: nil, assigned: ["kai"]),
                makeItem(id: "mug", name: "Mug", total: 1500, assigned: []),
            ],
            ambiguities: [SmartSplitAmbiguity(
                id: "a1", kind: "participant", message: "Who does \"K\" refer to?", itemIds: ["mug"], options: [], resolved: false
            )]
        )
        let result = issues(draft)
        #expect(Set(result.map(\.code)) == ["missing_price", "missing_assignment", "unresolved_ambiguity"])
        #expect(result.allSatisfy { $0.severity == .error })
    }

    @Test func totalMismatchIsAWarningWithBothAmounts() {
        let draft = makeDraft(items: [makeItem(id: "a", total: 1000, assigned: ["kai"])], tax: 80, total: 1100)
        let result = issues(draft)
        #expect(result.map(\.code) == ["total_mismatch"])
        #expect(result[0].severity == .warning)
        #expect(result[0].message.contains("$11.00") && result[0].message.contains("$10.80"))
    }

    @Test func flagsDuplicatesAndSubtotalMismatch() {
        let draft = makeDraft(
            items: [
                makeItem(id: "t1", name: "T-Shirt", total: 2499, assigned: ["kai"]),
                makeItem(id: "t2", name: "T Shirt", total: 2499, assigned: ["john"]),
            ],
            subtotal: 2499
        )
        #expect(Set(issues(draft).map(\.code)) == ["possible_duplicate", "subtotal_mismatch"])
    }

    @Test func messagesMatchServerWording() {
        // Same wording as validate.ts so users see identical text before and after saving.
        let draft = makeDraft(items: [makeItem(id: "s", name: "Shampoo", total: nil, assigned: ["kai"])])
        #expect(issues(draft).first?.message == "Shampoo needs a price.")
    }
}

@Suite struct SmartSplitDecodingTests {
    @Test func decodesServerInterpretation() throws {
        let json = """
        {"draft":{"merchant":"Target","currency":"USD","paidByParticipantId":null,
          "items":[{"id":"item_1","name":"Eggs","quantity":1,"unitPriceCents":700,"totalPriceCents":700,
            "discountCents":null,"assignedParticipantIds":["kai","john"],"splitType":"equal","weights":null,
            "source":"text","confidence":0.96,"needsPrice":false,"needsAssignment":false}],
          "subtotalCents":null,"taxCents":300,"tipCents":null,"feeCents":null,"shippingCents":null,
          "discountCents":null,"totalCents":null,"ambiguities":[],"missingInformation":[],"confidence":0.9},
         "calculation":{"perParticipant":[{"participantId":"kai","itemsCents":350,"discountCents":0,"taxCents":150,
           "tipCents":0,"feeCents":0,"shippingCents":0,"totalCents":500}],"computedSubtotalCents":700,
           "computedTotalCents":1000,"excludedItemIds":[]},
         "issues":[{"code":"low_confidence","severity":"warning","message":"x","itemIds":[]}]}
        """
        let result = try JSONDecoder().decode(SmartSplitService.Interpretation.self, from: Data(json.utf8))
        #expect(result.draft.items.first?.assignedParticipantIds == ["kai", "john"])
        #expect(result.draft.taxCents == 300)
        #expect(result.issues.first?.severity == .warning)
    }

    @Test func participantIdsAreLowercase() {
        let id = UUID(uuidString: "ABCDEF12-3456-7890-ABCD-EF1234567890")!
        #expect(id.participantId == "abcdef12-3456-7890-abcd-ef1234567890")
    }
}
