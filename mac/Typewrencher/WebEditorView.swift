import SwiftUI
import WebKit
import AppKit
import UniformTypeIdentifiers

// Hosts the web app and speaks bridge protocol 1 (js/host.js).
//   page -> native: ready, textChanged, export, open, close, files, grantFolder, openFile
//                   (message handler "typewrencher", replies allowed)
//   native -> page: window.TypewrencherHost.setDocument({ text, name }), setFiles({ access, folder, ... })
struct WebEditorView: NSViewRepresentable {
    @Binding var document: TextDocument
    var name: String
    var fileURL: URL?
    @Environment(\.openDocument) private var openDocument

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
        let moved = context.coordinator.parent.fileURL != fileURL   // saved for the first time, renamed or moved
        context.coordinator.parent = self
        context.coordinator.pushIfNeeded()
        if moved { context.coordinator.sendFiles() }
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
        private var filesOpen = false                 // the page's files drawer is showing
        private var watcher: FolderWatcher?
        private var watchedFolder: URL?

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
                filesOpen = false   // a reloaded page says again whether its drawer is open
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
            case "open":
                showOpenPanel()
                replyHandler(nil, nil)
            case "close":
                // Queued behind any textChanged update above, so the newest text is what gets saved.
                // performClose is the standard close: it saves, or asks first for an untitled document.
                DispatchQueue.main.async { self.web?.window?.performClose(nil) }
                replyHandler(nil, nil)
            case "files":
                filesOpen = body["open"] as? Bool ?? false
                if filesOpen { sendFiles() } else { watcher = nil; watchedFolder = nil }
                replyHandler(nil, nil)
            case "grantFolder":
                askForFolder()
                replyHandler(nil, nil)
            case "openFile":
                if let name = body["name"] as? String { switchTo(fileNamed: name) }
                replyHandler(nil, nil)
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

        // The page's Open button: the standard Open panel. An empty Untitled window gives way to the
        // opened document; otherwise the document opens in its own window, as with File > Open.
        private func showOpenPanel() {
            DispatchQueue.main.async {
                let panel = NSOpenPanel()
                panel.allowedContentTypes = [.plainText]
                panel.allowsMultipleSelection = false
                panel.begin { response in
                    guard response == .OK, let url = panel.url else { return }
                    let replace = self.parent.name.isEmpty && self.parent.document.text.isEmpty
                    let window = self.web?.window
                    Task {
                        do {
                            try await self.parent.openDocument(at: url)
                            if replace { window?.performClose(nil) }
                        } catch {
                            NSApp.presentError(error)
                        }
                    }
                }
            }
        }

        // The files drawer: send the page the .txt files in this document's folder, and keep watching the
        // folder while the drawer is open. Without the person's permission for the folder, say so instead.
        func sendFiles() {
            guard pageReady, filesOpen, let web else { return }
            var state: [String: Any] = ["access": "none"]
            if let file = parent.fileURL {
                let folder = file.deletingLastPathComponent()
                state = ["access": "needed", "folder": folder.lastPathComponent,
                         "path": FolderAccess.displayPath(folder), "current": file.lastPathComponent]
                if let url = FolderAccess.url(for: folder), let files = FolderAccess.textFiles(in: url) {
                    state["access"] = "granted"
                    state["files"] = files.map { ["name": $0.name, "modified": ($0.modified.timeIntervalSince1970 * 1000).rounded()] }
                    if watchedFolder != folder {
                        watcher = FolderWatcher(folder: url) { [weak self] in self?.sendFiles() }
                        watchedFolder = folder
                    }
                }
            }
            guard let json = try? JSONSerialization.data(withJSONObject: state),
                  let js = String(data: json, encoding: .utf8) else { return }
            web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setFiles && window.TypewrencherHost.setFiles(\(js))")
        }

        // The drawer's Allow access button: an Open panel already showing the document's folder, so one
        // click grants it. FolderAccess remembers the choice for later launches.
        private func askForFolder() {
            guard let file = parent.fileURL, let window = web?.window else { return }
            let folder = file.deletingLastPathComponent()
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.allowsMultipleSelection = false
            panel.directoryURL = folder
            panel.prompt = "Allow Access"
            panel.message = "Allow Typewrencher to show the files in “\(folder.lastPathComponent)”."
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { return }
                FolderAccess.remember(url)
                self.sendFiles()
            }
        }

        // A file chosen in the drawer replaces this document in the same window: the chosen file opens
        // where this window is, then this window closes, which saves it. The page sent any unsent text first.
        private func switchTo(fileNamed name: String) {
            guard let file = parent.fileURL, !name.contains("/") else { return }
            let target = file.deletingLastPathComponent().appendingPathComponent(name)
            guard target.standardizedFileURL != file.standardizedFileURL else { return }
            let oldWindow = web?.window
            DispatchQueue.main.async {   // after the textChanged update queued just before
                Task {
                    do {
                        try await self.parent.openDocument(at: target)
                        if let old = oldWindow, let new = NSApp.keyWindow, new !== old { new.setFrame(old.frame, display: true) }
                        oldWindow?.performClose(nil)
                    } catch {
                        NSApp.presentError(error)
                    }
                }
            }
        }
    }
}
