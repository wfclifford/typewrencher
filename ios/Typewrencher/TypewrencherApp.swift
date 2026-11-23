import SwiftUI

// iOS phase 1 spike: one scene whose only content is the web view running the page. Multiple scenes
// are switched off in the build settings (INFOPLIST_KEY_UIApplicationSupportsMultipleScenes = NO).
@main
struct TypewrencherApp: App {
    var body: some Scene {
        WindowGroup {
            // The page draws under the notch and home indicator itself (viewport-fit=cover and
            // env(safe-area-inset-*) in css/styles.css), so the web view fills the whole screen.
            WebEditorView()
                .ignoresSafeArea(.all)
        }
    }
}
