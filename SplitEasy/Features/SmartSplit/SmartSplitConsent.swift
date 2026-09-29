import SwiftUI

/// Consent to send Smart Split input to a third-party AI service (App Review guideline 5.1.2(i)).
/// Versioned so a materially different disclosure can ask again.
enum SmartSplitConsent {
    static let storageKey = "smartSplitAIConsent.v1"
}

/// Public pages served by GitHub Pages from `docs/` (also the URLs entered in App Store Connect).
enum AppLinks {
    static let privacyPolicy = URL(string: "https://qaz6209031.github.io/SplitEasy/privacy/")!
    static let support = URL(string: "https://qaz6209031.github.io/SplitEasy/support/")!
}

/// Explains what Smart Split sends to the AI service. Used before the first Smart Split and from Settings.
struct SmartSplitConsentSheet: View {
    /// true when opened from Settings by someone who already agreed (offers withdrawal instead).
    let alreadyGranted: Bool
    let onAllow: () -> Void
    let onDecline: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 40))
                        .foregroundStyle(.purple)
                        .accessibilityHidden(true)

                    Text("Smart Split uses AI")
                        .font(.title2.bold())

                    point(
                        "paperplane",
                        "What's sent",
                        "The description you type and any receipt or image you attach, plus the display names of people in the group so items can be matched to them."
                    )
                    point(
                        "building.2",
                        "Who receives it",
                        "A third-party AI service: OpenRouter and the AI model provider it routes to. They process it only to read the expense and return the items."
                    )
                    point(
                        "person.crop.circle.badge.xmark",
                        "What it isn't used for",
                        "It isn't used to identify you, for advertising, or for tracking. Your email and account details aren't sent."
                    )
                    point(
                        "checkmark.shield",
                        "You stay in control",
                        "Nothing is saved until you review and tap Save. You can always add expenses manually instead, and change this choice in Settings."
                    )

                    Link("Read the Privacy Policy", destination: AppLinks.privacyPolicy)
                        .font(.subheadline)
                }
                .padding(24)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    if alreadyGranted {
                        Button(role: .destructive) {
                            onDecline()
                            dismiss()
                        } label: {
                            Text("Stop Using AI").frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .buttonStyle(.bordered)
                        Button("Done") { dismiss() }
                    } else {
                        Button {
                            onAllow()
                            dismiss()
                        } label: {
                            Text("Continue").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                        }
                        .buttonStyle(.borderedProminent)
                        Button("Not Now") {
                            onDecline()
                            dismiss()
                        }
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(.bar)
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .interactiveDismissDisabled(!alreadyGranted)
    }

    private func point(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.tint)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    SmartSplitConsentSheet(alreadyGranted: false, onAllow: {}, onDecline: {})
}
