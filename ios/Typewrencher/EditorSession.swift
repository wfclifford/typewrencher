import WebKit

// The one open document and the page that edits it. Phase 2a, step 1: when the page is ready, reopen the last
// document (or start untitled.txt) and show it. Saving, the files drawer, rename and export come in later steps.
// Behavior follows mac/Typewrencher/EditorSession.swift, without the AppKit parts.
final class EditorSession {
    weak var web: WKWebView?
    private let store = DocumentStore()
    private var launched = false
    private(set) var fileURL: URL?
    private(set) var text = ""

    // The page has started (bridge message "ready"). The first time, show the last document or a new one; if the
    // page reloads and says ready again, show the document that is already open.
    func pageReady() {
        if !launched {
            launched = true
            launch()
        } else {
            push()
        }
    }

    private func launch() {
        // open() already says why when the last file cannot be read, so no second message here: it would hide the reason.
        if let last = store.lastFile, open(last) { return }
        newDocument()
    }

    func newDocument() {
        do {
            open(try store.createUntitled())
        } catch {
            notify("Typewrencher couldn\u{2019}t create a document: \(Self.reason(error)).")
        }
    }

    // Reads the file and shows it. On failure the current document stays and the person is told why, inline.
    @discardableResult
    private func open(_ url: URL) -> Bool {
        let newText: String
        do {
            newText = try TextFile.read(url)
        } catch {
            notify("Typewrencher couldn\u{2019}t open \(DocumentStore.displayName(url)): \(Self.reason(error)).")
            return false
        }
        fileURL = url
        text = newText
        store.remember(url)
        push(newText: true)
        return true
    }

    // Shows the open document in the page (TypewrencherHost.setDocument sends nothing back).
    private func push(newText: Bool = false) {
        guard let web, let url = fileURL else { return }
        let args: [String: Any] = ["text": text, "name": DocumentStore.displayName(url)]
        guard let json = try? JSONSerialization.data(withJSONObject: args), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setDocument(\(js))") { _, _ in
            // A new file's text must not be undoable back to the previous file's.
            if newText { web.undoManager?.removeAllActions() }
        }
    }

    // A short message on the page's notice line (no alerts in the app).
    func notify(_ message: String, sticky: Bool = false) {
        guard let web, let json = try? JSONSerialization.data(withJSONObject: [message]), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.notify(\(js)[0], { sticky: \(sticky) })")
    }

    private static func reason(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSCocoaErrorDomain, [257, 513].contains(nsError.code) { return "no permission" }
        if nsError.domain == NSCocoaErrorDomain, [4, 260].contains(nsError.code) { return "the file is missing" }
        let text = error.localizedDescription
        return text.hasSuffix(".") ? String(text.dropLast()) : text
    }
}
