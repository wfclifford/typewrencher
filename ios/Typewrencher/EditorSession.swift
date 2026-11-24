import UIKit
import WebKit

// The one open document and the page that edits it. Phase 2a: when the page is ready, reopen the last document
// (or start untitled.txt) and show it (step 1); save what is typed (step 2). The files drawer, rename and export
// come in later steps. Behavior follows mac/Typewrencher/EditorSession.swift, without the AppKit parts.
final class EditorSession {
    static let shared = EditorSession()

    weak var web: WKWebView?
    private let store = DocumentStore()
    private var launched = false
    private(set) var fileURL: URL?
    private(set) var text = ""
    private var savedText = ""          // what is in the file now
    private var saveWork: DispatchWorkItem?
    private var saveFailure: String?    // why the last save failed, until a save of this file works
    private static let saveDelay = 0.4  // seconds after the page's (already debounced) textChanged

    private var name: String { fileURL.map { DocumentStore.displayName($0) } ?? "" }

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
        savedText = newText
        store.remember(url)
        push(newText: true)
        return true
    }

    // MARK: Saving

    // The page sent new text (bridge message "textChanged", about 300 ms after typing stops): write it a moment later.
    func textChanged(_ newText: String) {
        text = newText
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.saveNow() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.saveDelay, execute: work)
    }

    struct MovedOrDeleted: LocalizedError {
        var errorDescription: String? { "it was moved or deleted outside Typewrencher" }
    }

    // Writes the newest text if it differs from the file. When writing fails the reason stays on the notice line
    // (sticky) until a save of this file works, and the text stays in the page. A file moved or deleted outside
    // the app (in the Files app, say) is not recreated, so a file the person removed does not come back on its own.
    @discardableResult
    func saveNow() -> Bool {
        saveWork?.cancel(); saveWork = nil
        guard let url = fileURL, text != savedText else { return true }
        do {
            guard FileManager.default.fileExists(atPath: url.path) else { throw MovedOrDeleted() }
            try TextFile.write(text, to: url)
            savedText = text
            if saveFailure != nil {
                saveFailure = nil
                notify("")
            }
            return true
        } catch {
            let reason = Self.reason(error)
            saveFailure = reason
            notify("Typewrencher couldn\u{2019}t save \(name): \(reason). Your text is still on the page; Export keeps a copy.", sticky: true)
            return false
        }
    }

    // The app is leaving the foreground (locked, switched away, closed): save what is on the page right now, even
    // text typed in the last 300 ms that the page has not sent yet. Saves what is already known first, then asks
    // the page, inside a background task so iOS does not suspend the app halfway.
    func saveBeforeLeaving() {
        guard fileURL != nil else { return }
        saveNow()
        guard let web else { return }
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        let file = fileURL
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.getText()") { result, _ in
            if let newText = result as? String, self.fileURL == file { self.text = newText }
            self.saveNow()
            UIApplication.shared.endBackgroundTask(task)
        }
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
