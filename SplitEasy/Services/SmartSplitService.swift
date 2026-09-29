import Foundation
import Supabase
import UIKit

/// Talks to the `smart-split` Edge Function. The app never sees the AI provider or its key.
enum SmartSplitService {
    struct Interpretation: Decodable {
        let draft: SmartSplitDraft
        let calculation: SmartSplitCalculation
        let issues: [SmartSplitIssue]
    }

    struct Failure: LocalizedError {
        let message: String
        let retryable: Bool
        var issues: [SmartSplitIssue] = []
        var errorDescription: String? { message }
    }

    private struct ErrorBody: Decodable {
        let error: String
        let retryable: Bool?
        let issues: [SmartSplitIssue]?
    }

    static func interpret(groupId: UUID, text: String, image: UIImage?) async throws -> Interpretation {
        struct Body: Encodable {
            let action = "interpret"
            let groupId: String
            let text: String
            let imageDataUrl: String?
        }
        let imageDataUrl = await Task.detached(priority: .userInitiated) { image.flatMap { SmartSplitService.dataURL(for: $0) } }.value
        return try await invoke(Body(groupId: groupId.participantId, text: text, imageDataUrl: imageDataUrl))
    }

    /// The server recomputes every amount from the draft; nothing the app calculated is trusted.
    static func commit(
        groupId: UUID,
        expenseId: UUID?,
        description: String,
        paidBy: UUID,
        draft: SmartSplitDraft
    ) async throws {
        struct Body: Encodable {
            let action = "commit"
            let groupId: String
            let expenseId: String?
            let description: String
            let paidBy: String
            let draft: SmartSplitDraft
        }
        struct Saved: Decodable { let expenseId: String }
        let _: Saved = try await invoke(Body(
            groupId: groupId.participantId,
            expenseId: expenseId?.participantId,
            description: description,
            paidBy: paidBy.participantId,
            draft: draft
        ))
    }

    private static func invoke<Body: Encodable, Response: Decodable>(_ body: Body) async throws -> Response {
        do {
            return try await supabase.functions.invoke("smart-split", options: FunctionInvokeOptions(body: body))
        } catch let FunctionsError.httpError(code, data) {
            let parsed = try? JSONDecoder().decode(ErrorBody.self, from: data)
            throw Failure(
                message: parsed?.error ?? "Smart Split failed (error \(code)).",
                retryable: parsed?.retryable ?? (code >= 500),
                issues: parsed?.issues ?? []
            )
        } catch is DecodingError {
            throw Failure(message: "Smart Split returned something unexpected. Please try again.", retryable: true)
        } catch let error as Failure {
            throw error
        } catch {
            throw Failure(message: userMessage(for: error), retryable: true)
        }
    }

    /// Downscales to at most 2048px on the long side and encodes as a JPEG data URL (~0.3–1 MB).
    static func dataURL(for image: UIImage, maxDimension: CGFloat = 2048) -> String? {
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        guard let jpeg = resized.jpegData(compressionQuality: 0.7) else { return nil }
        return "data:image/jpeg;base64," + jpeg.base64EncodedString()
    }
}
