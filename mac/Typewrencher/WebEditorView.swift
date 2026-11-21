import SwiftUI
import WebKit

// The window's content: the web view running the page, which is the editor. The session owns the
// document, the files and the bridge (see EditorSession.swift); this view only hosts the web view.
struct WebEditorView: NSViewRepresentable {
    let session: EditorSession

    func makeNSView(context: Context) -> WKWebView { session.makeWebView() }

    func updateNSView(_ web: WKWebView, context: Context) {}

    static func dismantleNSView(_ web: WKWebView, coordinator: ()) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "typewrencher", contentWorld: .page)
    }
}
