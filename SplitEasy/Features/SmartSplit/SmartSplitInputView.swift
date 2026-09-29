import PhotosUI
import SwiftUI

/// ✨ Smart Split entry point: describe the expense in your own words, optionally attach a receipt,
/// then review the AI's interpretation before anything is saved.
struct SmartSplitFlowView: View {
    let groupId: UUID
    let members: [Profile]
    let currentUserId: UUID
    let onSaved: () async -> Void
    let onManualEntry: () -> Void

    @State private var review: SmartSplitReviewModel?

    var body: some View {
        NavigationStack {
            SmartSplitInputView(
                groupId: groupId,
                members: members,
                currentUserId: currentUserId,
                onManualEntry: onManualEntry
            ) { interpretation in
                review = SmartSplitReviewModel(
                    groupId: groupId,
                    members: members,
                    currentUserId: currentUserId,
                    draft: interpretation.draft
                )
            }
            .navigationDestination(item: $review) { model in
                SmartSplitReviewView(model: model, onSaved: onSaved)
            }
        }
    }
}

/// Identity-based, so a review model can drive `navigationDestination(item:)` and `.sheet(item:)`.
extension SmartSplitReviewModel: Hashable, Identifiable {
    nonisolated var id: ObjectIdentifier { ObjectIdentifier(self) }
    nonisolated static func == (lhs: SmartSplitReviewModel, rhs: SmartSplitReviewModel) -> Bool { lhs === rhs }
    nonisolated func hash(into hasher: inout Hasher) { hasher.combine(ObjectIdentifier(self)) }
}

struct SmartSplitInputView: View {
    let groupId: UUID
    let members: [Profile]
    let currentUserId: UUID
    let onManualEntry: () -> Void
    let onInterpreted: (SmartSplitService.Interpretation) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var image: UIImage?
    @State private var photoItem: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var showCamera = false
    @State private var isWorking = false
    @State private var failure: SmartSplitService.Failure?
    @State private var work: Task<Void, Never>?
    @AppStorage(SmartSplitConsent.storageKey) private var aiConsent = false
    @State private var showConsent = false
    /// Set after "Not Now" so the screen explains why nothing happened and points to manual entry.
    @State private var declinedConsent = false
    @FocusState private var editorFocused: Bool

    private var canSubmit: Bool {
        (!text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || image != nil) && !isWorking
    }

    /// Example lines using real member names so the format is obvious.
    private var placeholder: String {
        let others = members.filter { $0.id != currentUserId }.map(\.displayName)
        let friend = others.first ?? "Alex"
        return """
        Describe who got what…

        I got the shirt for $25
        \(friend) got the mug for $15
        Snacks $12 shared by everyone
        Tax was $4.80
        """
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                inputCard

                if let failure {
                    FailureBanner(failure: failure, hasImage: image != nil, onRetry: submit)
                }

                if declinedConsent && !aiConsent {
                    ConsentDeclinedBanner(onReview: { showConsent = true }, onManualEntry: manualEntry)
                }

                Button(action: manualEntry) {
                    Text("Enter manually instead")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderless)
                .disabled(isWorking)
            }
            .padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("✨ Smart Split")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                // Always available, even mid-request, so a slow AI call never traps the user.
                Button("Cancel") {
                    work?.cancel()
                    dismiss()
                }
            }
        }
        .sheet(isPresented: $showConsent) {
            SmartSplitConsentSheet(
                alreadyGranted: false,
                onAllow: {
                    aiConsent = true
                    declinedConsent = false
                    // Carry on with the request the user just asked for.
                    DispatchQueue.main.async { submit() }
                },
                onDecline: { declinedConsent = true }
            )
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self), let picked = UIImage(data: data) {
                    image = picked
                }
                photoItem = nil
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image = $0 }
                .ignoresSafeArea()
        }
        .onAppear { editorFocused = true }
        .interactiveDismissDisabled(isWorking || !text.isEmpty || image != nil)
    }

    private var inputCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
                TextEditor(text: $text)
                    .focused($editorFocused)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 180)
                    .disabled(isWorking)
                    .accessibilityLabel("Describe who got what")
            }

            if let image {
                AttachmentThumbnail(image: image) { self.image = nil }
                    .disabled(isWorking)
            }

            HStack {
                Menu {
                    Button("Photo Library", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take Photo", systemImage: "camera") { showCamera = true }
                    }
                } label: {
                    Label(image == nil ? "Add receipt / image" : "Replace image", systemImage: "paperclip")
                        .font(.subheadline)
                }
                .disabled(isWorking)

                Spacer()

                Button(action: submit) {
                    if isWorking {
                        HStack(spacing: 8) {
                            ProgressView()
                            Text("Working…")
                        }
                    } else {
                        Label("Smart Split", systemImage: "sparkles")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSubmit)
            }

            if isWorking {
                Text(image == nil ? "✨ Reading your expense..." : "✨ Reading items and matching them to people...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .transition(.opacity)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(LinearGradient(colors: [.purple.opacity(0.6), .blue.opacity(0.6)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
        )
    }

    private func submit() {
        guard canSubmit else { return }
        // Nothing leaves the device until the user has agreed to AI processing.
        guard aiConsent else {
            editorFocused = false
            showConsent = true
            return
        }
        editorFocused = false
        failure = nil
        isWorking = true
        work = Task {
            defer { isWorking = false }
            do {
                let result = try await SmartSplitService.interpret(groupId: groupId, text: text, image: image)
                if !Task.isCancelled { onInterpreted(result) }
            } catch let error as SmartSplitService.Failure {
                if !Task.isCancelled { failure = error }
            } catch {
                if !Task.isCancelled { failure = .init(message: userMessage(for: error), retryable: true) }
            }
        }
    }

    private func manualEntry() {
        dismiss()
        onManualEntry()
    }
}

private struct AttachmentThumbnail: View {
    let image: UIImage
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .accessibilityLabel("Attached image")
            Text("Receipt attached")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Spacer()
            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, Color(.systemGray))
                    .font(.title2)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("Remove image")
        }
    }
}

private struct ConsentDeclinedBanner: View {
    let onReview: () -> Void
    let onManualEntry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Smart Split needs your OK to use AI.", systemImage: "hand.raised.fill")
                .font(.subheadline)
            Text("Your description is still here. You can add the expense manually instead.")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Button("Review", action: onReview)
                    .buttonStyle(.bordered)
                Button("Enter Manually", action: onManualEntry)
                    .buttonStyle(.bordered)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(.tertiarySystemFill)))
    }
}

private struct FailureBanner: View {
    let failure: SmartSplitService.Failure
    let hasImage: Bool
    let onRetry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(failure.message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.subheadline)
            Text(hasImage ? "Your description and image are still here." : "Your description is still here.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if failure.retryable {
                Button("Try Again", action: onRetry)
                    .buttonStyle(.bordered)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.orange.opacity(0.12)))
    }
}

/// Minimal camera wrapper; only offered when the device has a camera.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}
