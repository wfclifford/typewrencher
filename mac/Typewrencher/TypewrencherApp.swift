import SwiftUI
import AppKit

// One window, always. Every way of opening a file (File > Open, Open Recent, the page's Open button,
// Finder, the Dock icon, the files drawer, New) switches that window's document; no second window opens.
@main
struct TypewrencherApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    private let session = EditorSession.shared

    var body: some Scene {
        Window("Typewrencher", id: "main") {
            EditorWindow(session: session, state: session.state)
        }
        .commands { FileCommands(session: session, state: session.state) }
    }
}

struct EditorWindow: View {
    let session: EditorSession
    let state: WindowState

    // One view structure, always: a branch here (for example adding navigationDocument once a file is
    // open) makes SwiftUI build a new web view, which reloads the page. The title bar's file icon is set
    // on the window instead (EditorSession.showInWindow).
    var body: some View {
        WebEditorView(session: session)
            .frame(minWidth: 480, minHeight: 360)
            .navigationTitle(state.title)
    }
}

// The File menu: the standard New, Open and Save groups replaced with this app's single-window versions.
struct FileCommands: Commands {
    let session: EditorSession
    let state: WindowState

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New") { session.newDocument() }.keyboardShortcut("n")
            Button("Open…") { session.showOpenPanel() }.keyboardShortcut("o")
            Menu("Open Recent") {
                ForEach(state.recents, id: \.self) { url in
                    Button(url.deletingPathExtension().lastPathComponent) { session.open(url) }
                }
                Divider()
                Button("Clear Menu") {
                    NSDocumentController.shared.clearRecentDocuments(nil)
                    state.refreshRecents()
                }
                .disabled(state.recents.isEmpty)
            }
        }
        CommandGroup(replacing: .saveItem) {
            Button("Close") { NSApp.keyWindow?.performClose(nil) }.keyboardShortcut("w")
            Button("Save") { session.saveFromMenu() }.keyboardShortcut("s")
            Button("Save As…") { session.saveAs() }.keyboardShortcut("s", modifiers: [.command, .shift])
            Button("Export…") { session.exportFromMenu() }.keyboardShortcut("e", modifiers: [.command, .shift])
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        EditorSession.shared.state.refreshRecents()
    }

    // Finder, the Dock icon and "Open With" send files here; they open in the one window.
    func application(_ application: NSApplication, open urls: [URL]) {
        if let url = urls.first { EditorSession.shared.open(url) }
    }

    // Closing the window quits the app (one window, always).
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // Save the newest text first; a failed save keeps the app open, with the message showing.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        EditorSession.shared.prepareToQuit { ok in sender.reply(toApplicationShouldTerminate: ok) }
        return .terminateLater
    }
}
