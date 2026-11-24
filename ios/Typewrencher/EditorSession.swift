import UIKit
import WebKit

// The one open document and the page that edits it. Phase 2a: reopen the last document (or start untitled.txt) when the
// page is ready, save what is typed, and switch, create and rename documents in the app's Documents folder, which the
// files drawer lists. Export comes in a later step. Behavior follows mac/Typewrencher/EditorSession.swift, without the
// AppKit parts.
final class EditorSession {
    static let shared = EditorSession()

    weak var web: WKWebView?
    private let store = DocumentStore()
    private var launched = false
    private var filesOpen = false
    private(set) var fileURL: URL?
    private(set) var text = ""
    private var savedText = ""          // what is in the file now
    private var saveWork: DispatchWorkItem?
    private var saveFailure: String?    // why the last save failed, until a save of this file works
    private var leaving: URL?           // the file just left, until the page shows the new one: late typing belongs to it
    private var operations: [(@escaping () -> Void) -> Void] = []
    private var operating = false
    private static let saveDelay = 0.4  // seconds after the page's (already debounced) textChanged

    private var name: String { fileURL.map { DocumentStore.displayName($0) } ?? "" }

    // The page has started (bridge message "ready"). The first time, show the last document or a new one; if the
    // page reloads and says ready again, show the document that is already open.
    func pageReady() {
        filesOpen = false   // a reloaded page says again whether its drawer is open
        if !launched {
            launched = true
            launch()
        } else {
            push()
        }
    }

    private func launch() {
        // openNow() already says why when the last file cannot be read, so no second message here: it would hide the reason.
        if let last = store.lastFile, openNow(last) { return }
        createUntitledDocument()
    }

    // MARK: One operation at a time

    // Runs an operation that changes which file is open after the ones before it have finished.
    private func perform(_ operation: @escaping (@escaping () -> Void) -> Void) {
        operations.append(operation)
        runNextOperation()
    }

    private func runNextOperation() {
        guard !operating, !operations.isEmpty else { return }
        operating = true
        let operation = operations.removeFirst()
        operation {
            self.operating = false
            self.runNextOperation()
        }
    }

    // MARK: Opening and creating

    // The one way to open a file (the drawer, New): in turn with other operations, take the page's current text,
    // save the current file, read the new one, then show it. On any failure the current file stays open and the
    // person is told why.
    func switchTo(_ target: URL, then done: ((Bool) -> Void)? = nil) {
        perform { finished in
            self.currentText { _ in
                let opened = self.openNow(target)
                done?(opened)
                finished()
            }
        }
    }

    // The page's drawer asked to open a file by its name (bridge message "openFile").
    func openFile(named name: String) {
        guard !name.contains("/"), !name.isEmpty else { return }
        switchTo(store.folder.appendingPathComponent(name))
    }

    // The switch itself, for use inside an operation.
    @discardableResult
    private func openNow(_ target: URL, createdUntitled: Bool = false) -> Bool {
        let url = target.standardizedFileURL
        if url == fileURL { push(); return true }
        if fileURL != nil { guard saveNow() else { return false } }
        let newText: String
        do {
            newText = try TextFile.read(url)
        } catch {
            notify("Typewrencher couldn\u{2019}t open \(DocumentStore.displayName(url)): \(Self.reason(error)).")
            return false
        }
        let old = fileURL
        fileURL = url
        text = newText
        savedText = newText
        if createdUntitled { store.setUntitled(url, true) }
        if let old { store.removeIfEmptyUntitled(old) }
        if saveFailure != nil { saveFailure = nil; notify("") }   // the failing file was left; its notice no longer applies
        // Typing the page has not yet handed over belongs to the file just left, until the page shows this one.
        leaving = old
        store.remember(url)
        push(newText: true)
        sendFiles()
        return true
    }

    // The "+" button: a new untitled file, after the current one is saved. A blank untitled page is not replaced.
    func newDocument() {
        perform { finished in
            self.currentText { _ in
                if let url = self.fileURL, self.store.isUntitled(url), self.text.isEmpty, self.savedText.isEmpty { return finished() }
                guard self.saveNow() else { return finished() }
                self.createUntitledDocument()
                finished()
            }
        }
    }

    private func createUntitledDocument() {
        do {
            openNow(try store.createUntitled(), createdUntitled: true)
        } catch {
            notify("Typewrencher couldn\u{2019}t create a document: \(Self.reason(error)).")
        }
    }

    // Asks the page for the text it has this moment (the page sends changes with a short delay).
    private func currentText(_ done: @escaping (String) -> Void) {
        guard let web, launched else { return done(text) }
        let file = fileURL
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.getText()") { result, _ in
            if let newText = result as? String, self.fileURL == file, self.leaving == nil { self.text = newText }
            done(self.text)
        }
    }

    // MARK: Renaming

    // The page's name field: rename the file in its folder. A refused rename sends the old name back to the page,
    // says why on the notice line, and replies with an error (the reply to the page's message).
    func rename(to raw: String, reply: @escaping (String?) -> Void) {
        perform { finished in
            self.renameNow(raw) { error in reply(error); finished() }
        }
    }

    private func renameNow(_ raw: String, done: @escaping (String?) -> Void) {
        guard let url = fileURL else { return done(nil) }
        let clean = DocumentStore.cleanName(raw)
        guard !clean.isEmpty, clean != name else { push(); return done(nil) }   // nothing to rename
        let target = store.folder.appendingPathComponent(clean + ".txt").standardizedFileURL
        let caseOnly = target.path.lowercased() == url.path.lowercased()   // "poem" to "Poem"
        if !caseOnly, FileManager.default.fileExists(atPath: target.path) {
            push()
            notify("A file named \(clean) already exists.")
            return done("exists")
        }
        guard saveNow() else { push(); return done("save failed") }
        do {
            try Self.move(url, to: target, caseOnly: caseOnly)
        } catch {
            push()
            notify("Typewrencher couldn\u{2019}t rename \(name): \(Self.reason(error)).")
            return done("failed")
        }
        store.setUntitled(url, false)   // a named file is kept even when empty
        fileURL = target
        store.remember(target)
        push()
        sendFiles()
        done(nil)
    }

    // On a case-insensitive volume a rename that only changes case can be refused as "already exists";
    // then it goes through a temporary name in the same folder.
    private static func move(_ url: URL, to target: URL, caseOnly: Bool) throws {
        do {
            try FileManager.default.moveItem(at: url, to: target)
        } catch where caseOnly {
            let temporary = url.deletingLastPathComponent().appendingPathComponent(".typewrencher-rename-\(UUID().uuidString).txt")
            try FileManager.default.moveItem(at: url, to: temporary)
            do { try FileManager.default.moveItem(at: temporary, to: target) } catch {
                try? FileManager.default.moveItem(at: temporary, to: url)   // put it back
                throw error
            }
        }
    }

    // MARK: Saving

    // The page sent new text (bridge message "textChanged", about 300 ms after typing stops): write it a moment later.
    func textChanged(_ newText: String) {
        if let old = leaving {
            // Typed into the file just left, before the page showed the new one: it belongs there, unless that file
            // is gone, which a late write must not bring back.
            if FileManager.default.fileExists(atPath: old.path) { try? TextFile.write(newText, to: old) }
            return
        }
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
            if let newText = result as? String, self.fileURL == file, self.leaving == nil { self.text = newText }
            self.saveNow()
            UIApplication.shared.endBackgroundTask(task)
        }
    }

    // MARK: The files drawer

    // The page's drawer opened or closed (bridge message "files"): while it is open, send the list.
    func filesDrawer(open: Bool) {
        filesOpen = open
        if open { sendFiles() }
    }

    // The app came back to the foreground: files may have been added, moved or deleted in the Files app.
    func refreshFiles() { sendFiles() }

    // Sends the page the .txt files in the Documents folder (TypewrencherHost.setFiles).
    private func sendFiles() {
        guard launched, filesOpen, let web, let file = fileURL else { return }
        let files = store.textFiles().map { ["name": $0.name, "modified": ($0.modified.timeIntervalSince1970 * 1000).rounded()] as [String: Any] }
        let state: [String: Any] = ["access": "granted", "folder": store.folderLabel, "path": store.displayPath,
                                    "current": file.lastPathComponent, "files": files]
        guard let json = try? JSONSerialization.data(withJSONObject: state), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setFiles && window.TypewrencherHost.setFiles(\(js))")
    }

    // MARK: Showing things in the page

    // Shows the open document in the page (TypewrencherHost.setDocument sends nothing back).
    private func push(newText: Bool = false) {
        guard let web, let url = fileURL else { return }
        let args: [String: Any] = ["text": text, "name": DocumentStore.displayName(url)]
        guard let json = try? JSONSerialization.data(withJSONObject: args), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setDocument(\(js))") { _, _ in
            // A new file's text must not be undoable back to the previous file's.
            if newText { web.undoManager?.removeAllActions() }
            self.leaving = nil   // the page shows this file now
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
