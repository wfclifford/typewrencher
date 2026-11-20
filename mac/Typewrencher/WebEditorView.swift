import SwiftUI
import WebKit
import AppKit
import UniformTypeIdentifiers

// Hosts the web app and speaks bridge protocol 1 (js/host.js).
//   page -> native: ready, textChanged, export   (message handler "typewrencher", replies allowed)
//   native -> page: window.TypewrencherHost.setDocument({ text, name })
struct WebEditorView: NSViewRepresentable {
    @Binding var document: TextDocument
    var name: String

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SiteSchemeHandler(), forURLScheme: SiteSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "typewrencher")
        let web = WKWebView(frame: .zero, configuration: config)
        #if DEBUG
        web.isInspectable = true   // Safari > Develop > this Mac
        #endif
        context.coordinator.web = web
        web.load(URLRequest(url: SiteSchemeHandler.startURL))
        return web
    }

    func updateNSView(_ web: WKWebView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.pushIfNeeded()
    }

    static func dismantleNSView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "typewrencher", contentWorld: .page)
    }

    final class Coordinator: NSObject, WKScriptMessageHandlerWithReply {
        var parent: WebEditorView
        weak var web: WKWebView?
        private var pageReady = false
        private var lastPushed: (text: String, name: String)?
        private var lastFromPage: String?

        init(_ parent: WebEditorView) { self.parent = parent }

        // Send the document to the page when it differs from what the page last told us or was last given.
        func pushIfNeeded() {
            guard pageReady, let web else { return }
            let text = parent.document.text, name = parent.name
            if text == lastFromPage, lastPushed?.name == name { return }
            if let last = lastPushed, last.text == text, last.name == name { return }
            lastPushed = (text, name)
            lastFromPage = text
            let args = ["text": text, "name": name]
            guard let json = try? JSONSerialization.data(withJSONObject: args),
                  let js = String(data: json, encoding: .utf8) else { return }
            web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setDocument(\(js))")
        }

        func userContentController(_ controller: WKUserContentController,
                                   didReceive message: WKScriptMessage,
                                   replyHandler: @escaping (Any?, String?) -> Void) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
                return replyHandler(nil, "bad message")
            }
            switch type {
            case "ready":
                pageReady = true
                lastPushed = nil; lastFromPage = nil
                pushIfNeeded()
                replyHandler(nil, nil)
            case "textChanged":
                if let text = body["text"] as? String {
                    lastFromPage = text
                    DispatchQueue.main.async { self.parent.document.text = text }
                }
                replyHandler(nil, nil)
            case "export":
                export(filename: body["filename"] as? String ?? "title.txt",
                       data: body["data"] as? String ?? "", reply: replyHandler)
            default:
                replyHandler(nil, "unknown message type")
            }
        }

        // The page's .txt button: ask where to save a copy. A cancelled panel rejects with "declined",
        // which js/host.js turns into the page's quiet "person cancelled" path.
        private func export(filename: String, data: String, reply: @escaping (Any?, String?) -> Void) {
            DispatchQueue.main.async {
                let panel = NSSavePanel()
                panel.allowedContentTypes = [.plainText]
                panel.nameFieldStringValue = filename
                panel.begin { response in
                    guard response == .OK, let url = panel.url else { return reply(nil, "declined") }
                    do {
                        try Data(data.utf8).write(to: url, options: .atomic)
                        reply(nil, nil)
                    } catch {
                        reply(nil, "failed: \(error.localizedDescription)")
                    }
                }
            }
        }
    }
}
