import SwiftUI

// iOS phase 1 spike: one scene whose only content is the web view running the page. Multiple scenes
// are switched off in the build settings (INFOPLIST_KEY_UIApplicationSupportsMultipleScenes = NO).
@main
struct TypewrencherApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            // The page draws under the notch and home indicator itself (viewport-fit=cover and
            // env(safe-area-inset-*) in css/styles.css), so the web view fills the whole screen.
            WebEditorView()
                .ignoresSafeArea(.all)
                .onChange(of: scenePhase) { _, phase in
                    // Locked, switched away or closed: write what is on the page before iOS suspends the app.
                    if phase != .active { EditorSession.shared.saveBeforeLeaving() }
                }
        }
    }
}
