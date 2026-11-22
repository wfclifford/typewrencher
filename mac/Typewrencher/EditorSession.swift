import SwiftUI
import WebKit
import AppKit
import UniformTypeIdentifiers

// What the window and the File menu show: the document's name and file, and Open Recent.
@Observable
final class WindowState {
    var title = "Typewrencher"
    var fileURL: URL?
    var recents: [URL] = []

    func refreshRecents() { recents = NSDocumentController.shared.recentDocumentURLs }
}

// The one document of the one window, and bridge protocol 1 with the page (js/host.js).
//   page -> native: ready, textChanged, export, open, new, rename, close, files, grantFolder, openFile, trash, untrash
//   native -> page: TypewrencherHost.setDocument, setFiles, notify, exportNow, getText
// Every document is a real .txt file from the moment it exists, and every way of opening one goes
// through switchTo(_:), which saves the current file first. Edits are saved a moment after the page sends
// them. Messages for the person go to the page's notice line (notify), never to an alert.
final class EditorSession: NSObject, WKScriptMessageHandlerWithReply {
    static let shared = EditorSession()
    let state = WindowState()

    private weak var web: WKWebView?
    private weak var window: NSWindow?
    private var pageReady = false, launched = false
    private var queuedNotes: [(String, Bool)] = [] // messages (and sticky) from before the page was ready
    private var pendingOpen: URL?                  // a Finder or Dock open that arrived before the page

    private var fileURL: URL?                      // the current document
    private var text = ""                          // its newest text, from the page
    private var savedText = ""                     // its text on disk, as far as this app knows
    private var saveWork: DispatchWorkItem?
    private var fileWatcher: PathWatcher?
    private var renaming = false

    // Saving the current file is failing: a sticky notice is showing, cleared by the next good save.
    private var saveFailure: String?               // the reason, for the quit notice
    // A quit was refused because the save failed: a second quit within 15 s, or with no typing since, quits.
    private var quitRefusedAt: Date?, quitRefusedText: String?

    // Operations that change which file is open (switching, New, renaming) run one at a time, each starting
    // from the page's current text, so two that arrive close together cannot interleave.
    private var operations: [(@escaping () -> Void) -> Void] = []
    private var operating = false
    // Just after a switch, until the page shows the new text: the file that was left. Text the page sends
    // in that moment was typed into the old file and goes there, never into the new one.
    private var leaving: URL?

    private var filesOpen = false                  // the page's files drawer is showing
    private var folderWatcher: PathWatcher?
    private var watchedFolder: URL?

    private static let saveDelay = 0.4             // seconds after the page's (already debounced) textChanged
    private static let untitledKey = "untitledFiles", documentsKey = "documentsFolder"

    private var name: String { fileURL?.deletingPathExtension().lastPathComponent ?? "" }

    // MARK: The web view

    func makeWebView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SiteSchemeHandler(), forURLScheme: SiteSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "typewrencher")
        let web = EditorWebView(frame: .zero, configuration: config)
        #if DEBUG
        web.isInspectable = true   // Safari > Develop > this Mac
        #endif
        web.onWindow = { [weak self] window in self?.attach(window) }
        self.web = web
        web.load(URLRequest(url: SiteSchemeHandler.startURL))
        return web
    }

    private func attach(_ window: NSWindow?) {
        guard let window, self.window !== window else { return }
        self.window = window
        window.tabbingMode = .disallowed
        window.representedURL = fileURL
        // Closing the one window quits the app. The close button asks to quit instead of closing first, so a
        // quit that is refused (a save that keeps failing) leaves the window open with its notice.
        if let close = window.standardWindowButton(.closeButton) {
            close.target = self
            close.action = #selector(closeWindow)
        }
        // Size and position are kept between launches. SwiftUI gives the window its default size after it
        // attaches, which would overwrite the saved frame, so the saved frame is applied again just after.
        let name = "TypewrencherMain"
        let saved = UserDefaults.standard.string(forKey: "NSWindow Frame \(name)")
        if let saved { window.setFrame(from: saved) }
        DispatchQueue.main.async {
            if let saved { window.setFrame(from: saved) }
            window.setFrameAutosaveName(name)
        }
    }

    // MARK: Messages from the page

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            return replyHandler(nil, "bad message")
        }
        switch type {
        case "ready":
            pageReady = true
            filesOpen = false   // a reloaded page says again whether its drawer is open
            if !launched { launched = true; launch() } else { push() }
            let notes = queuedNotes; queuedNotes = []
            notes.forEach { notify($0.0, sticky: $0.1) }
            replyHandler(nil, nil)
        case "textChanged":
            if let newText = body["text"] as? String {
                if let old = leaving {
                    // Typed into the file just left, before the page showed the new one: it belongs there,
                    // unless the file is gone (moved to the Trash), which a late write must not bring back.
                    if FileManager.default.fileExists(atPath: old.path) { try? TextFile.write(newText, to: old, atomically: FolderAccess.url(for: old.deletingLastPathComponent()) != nil) }
                } else {
                    text = newText
                    scheduleSave()
                }
            }
            replyHandler(nil, nil)
        case "export":
            export(filename: body["filename"] as? String ?? "title.txt", data: body["data"] as? String ?? "", reply: replyHandler)
        case "open":
            showOpenPanel(); replyHandler(nil, nil)
        case "new":
            newDocument(); replyHandler(nil, nil)
        case "rename":
            let raw = body["name"] as? String ?? ""
            perform { finished in self.rename(to: raw) { error in replyHandler(nil, error); finished() } }
        case "close":
            closeWindow(); replyHandler(nil, nil)   // no longer sent by the page; still handled
        case "files":
            filesOpen = body["open"] as? Bool ?? false
            if filesOpen { sendFiles() } else { folderWatcher = nil; watchedFolder = nil }
            replyHandler(nil, nil)
        case "grantFolder":
            if let folder = fileURL?.deletingLastPathComponent() { askForFolder(folder) { _ in self.sendFiles() } }
            replyHandler(nil, nil)
        case "openFile":
            if let name = body["name"] as? String, !name.contains("/"), let folder = fileURL?.deletingLastPathComponent() {
                switchTo(folder.appendingPathComponent(name))
            }
            replyHandler(nil, nil)
        case "trash":
            let name = body["name"] as? String ?? ""
            perform { finished in self.trash(name) { value, error in replyHandler(value, error); finished() } }
        case "untrash":
            untrash(body["undoId"] as? String ?? "", reply: replyHandler)
        default:
            replyHandler(nil, "unknown message type")
        }
    }

    // File > Close, the close button and the page's close message: the same as quitting.
    @objc func closeWindow() { NSApp.terminate(nil) }

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

    // MARK: Opening

    // Finder, the Dock icon and Open Recent. Before the page is ready the file waits and opens at launch.
    func open(_ url: URL) {
        window?.makeKeyAndOrderFront(nil)
        if pageReady { switchTo(url) } else { pendingOpen = url }
    }

    // At launch: a file from Finder or the Dock, else the last-open file, else a new document.
    private func launch() {
        if let url = pendingOpen {
            pendingOpen = nil
            switchTo(url) { opened in if !opened { self.reopenLastFile() } }
        } else {
            reopenLastFile()
        }
    }

    private func reopenLastFile() {
        guard let last = FileAccess.lastFile else { return newDocument() }
        let couldNot = { self.notify("Typewrencher couldn't reopen \(last.deletingPathExtension().lastPathComponent).") }
        guard FileManager.default.fileExists(atPath: last.path) else { couldNot(); return newDocument() }
        switchTo(last) { opened in if !opened { couldNot(); self.newDocument() } }
    }

    // The one way to open a file, for every path (the drawer, File > Open, Open Recent, Finder, the Dock):
    // in turn with other switches, take the page's current text, save the current file, read the new one,
    // then show it everywhere. On any failure the current file stays open and the person is told why.
    func switchTo(_ target: URL, then done: ((Bool) -> Void)? = nil) {
        perform { finished in
            self.currentText { _ in
                let opened = self.openNow(target)
                done?(opened)
                finished()
            }
        }
    }

    // The switch itself, for use inside an operation. keepCurrent: leave the current file as it is on disk
    // without saving it (Save As has just written its text to the new file, so it is safe there).
    @discardableResult
    private func openNow(_ target: URL, createdUntitled: Bool = false, keepCurrent: Bool = false) -> Bool {
        let url = target.standardizedFileURL
        if url == fileURL { push(); return true }
        if !keepCurrent { guard saveNow() else { return false } }
        let newText: String
        do {
            newText = try readWithAccess(url)
        } catch {
            notify("Typewrencher couldn't open \(url.deletingPathExtension().lastPathComponent): \(Self.reason(error)).")
            return false
        }
        let old = fileURL
        fileURL = url
        text = newText
        savedText = newText
        if createdUntitled { setUntitled(url, true) }
        if let old {
            trashIfEmptyUntitled(old)
            FileAccess.stop(old)
        }
        if keepCurrent, saveFailure != nil {   // the failing file was left; its notice no longer applies
            saveFailure = nil
            quitRefusedAt = nil
            notify("")
        }
        // After Save As the page's text is this file's text, so late typing belongs here; otherwise it
        // belongs to the file just left.
        leaving = keepCurrent ? nil : old
        remember(url)
        push(newText: true)
        showInWindow()
        watchFile()
        sendFiles()
        return true
    }

    // Reads a file, using its saved permission if the app cannot reach it directly.
    private func readWithAccess(_ url: URL) throws -> String {
        do { return try TextFile.read(url) } catch {
            guard FileAccess.start(url) else { throw error }
            return try TextFile.read(url)
        }
    }

    private func remember(_ url: URL) {
        FileAccess.remember(url)
        FileAccess.lastFile = url
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        state.refreshRecents()
        let folder = url.deletingLastPathComponent()
        if FolderAccess.url(for: folder) != nil { UserDefaults.standard.set(folder.path, forKey: Self.documentsKey) }
    }

    func showOpenPanel() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.plainText]
        panel.allowsMultipleSelection = false
        if let folder = fileURL?.deletingLastPathComponent() { panel.directoryURL = folder }
        run(panel) { url in self.switchTo(url) }
    }

    // MARK: Saving

    private func scheduleSave() {
        saveWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.saveNow() }
        saveWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.saveDelay, execute: work)
    }

    struct MovedOrDeleted: LocalizedError {
        var errorDescription: String? { "it was moved or deleted outside Typewrencher" }
    }

    // Writes the newest text if it differs from the file. False when writing fails; the reason then stays
    // on the notice line (sticky) until a save of this file works, since meanwhile switching away is
    // refused and quitting asks first. A file moved or deleted outside the app is not recreated, so a file
    // the person removed does not come back on its own; Save As keeps the text.
    @discardableResult
    func saveNow() -> Bool {
        saveWork?.cancel(); saveWork = nil
        guard let url = fileURL, text != savedText else { return true }
        do {
            guard FileManager.default.fileExists(atPath: url.path) else { throw MovedOrDeleted() }
            let atomically = FolderAccess.url(for: url.deletingLastPathComponent()) != nil
            try TextFile.write(text, to: url, atomically: atomically)
            savedText = text
            if saveFailure != nil {
                saveFailure = nil
                quitRefusedAt = nil
                notify("")
            }
            return true
        } catch {
            let reason = Self.reason(error)
            saveFailure = reason
            notify("Typewrencher couldn't save \(name): \(reason). Use Save As… to keep your text.", sticky: true)
            return false
        }
    }

    // File > Save: take the page's text as it is this moment (even mid-typing) and write it now.
    func saveFromMenu() {
        currentText { _ in self.saveNow() }
    }

    // File > Save As…: write the text to a new file the person chooses, then switch to it. This is also the
    // way out when the current file cannot be saved: the switch does not save the old file, because its
    // text is already safe in the new one.
    func saveAs() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = (name.isEmpty ? "untitled" : name) + ".txt"
        if let folder = fileURL?.deletingLastPathComponent() { panel.directoryURL = folder }
        run(panel) { url in
            self.perform { finished in
                self.currentText { text in
                    do {
                        try TextFile.write(text, to: url, atomically: true)
                    } catch {
                        self.notify("Typewrencher couldn't save \(url.deletingPathExtension().lastPathComponent): \(Self.reason(error)).", sticky: true)
                        return finished()
                    }
                    if url.standardizedFileURL == self.fileURL {   // saved over the current file
                        self.savedText = text
                        if self.saveFailure != nil { self.saveFailure = nil; self.quitRefusedAt = nil; self.notify("") }
                    }
                    self.openNow(url, keepCurrent: true)
                    finished()
                }
            }
        }
    }

    // File > Export…: the same as the page's Export button.
    func exportFromMenu() {
        web?.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.exportNow()")
    }

    // The page's current text, which may be newer than its last textChanged message. A reply that arrives
    // after a switch is the old file's text, so it is ignored.
    private func currentText(_ done: @escaping (String) -> Void) {
        guard pageReady, let web else { return done(text) }
        let file = fileURL
        web.evaluateJavaScript("window.TypewrencherHost.getText()") { result, _ in
            if let newText = result as? String, self.fileURL == file, self.leaving == nil { self.text = newText }
            done(self.text)
        }
    }

    // Quitting (Cmd-Q, File > Close, the close button): save the newest text and trash an empty untitled
    // file. If saving fails the app stays open and says how to go on; asking to quit again within 15
    // seconds, or at any time without typing since that notice, quits without saving.
    func prepareToQuit(_ done: @escaping (Bool) -> Void) {
        var finished = false
        let decide = {
            guard !finished else { return }
            finished = true
            if self.saveNow() {
                if let url = self.fileURL { self.trashIfEmptyUntitled(url) }
                return done(true)
            }
            if let at = self.quitRefusedAt, Date().timeIntervalSince(at) < 15 || self.text == self.quitRefusedText {
                return done(true)   // asked again: quit without saving
            }
            self.quitRefusedAt = Date()
            self.quitRefusedText = self.text
            self.notify("Typewrencher couldn't save \(self.name): \(self.saveFailure ?? "unknown error"). Press ⌘Q again to quit without saving, or use Save As… to keep your text.", sticky: true)
            done(false)
        }
        currentText { _ in decide() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { decide() }   // the page did not answer
    }

    // MARK: New documents

    // The "+" button and File > New: a new empty file named "untitled.txt" (or "untitled 2.txt", ...) in
    // the current file's folder, or in the documents folder when the app may not write there.
    func newDocument() {
        perform { finished in
            self.currentText { _ in
                if let url = self.fileURL, self.isUntitled(url), self.text.isEmpty, self.savedText.isEmpty { return finished() }   // already a blank page
                guard self.saveNow() else { return finished() }
                if let folder = self.fileURL?.deletingLastPathComponent(), FolderAccess.url(for: folder) != nil {
                    self.createUntitled(in: folder)
                    finished()
                } else if let path = UserDefaults.standard.string(forKey: Self.documentsKey),
                          FolderAccess.url(for: URL(fileURLWithPath: path)) != nil {
                    self.createUntitled(in: URL(fileURLWithPath: path))
                    finished()
                } else {
                    self.chooseDocumentsFolder(then: finished)
                }
            }
        }
    }

    private func chooseDocumentsFolder(then finished: @escaping () -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder for new documents"
        run(panel, ifCancelled: { self.notify("Choose a folder to create new documents in."); finished() }) { folder in
            FolderAccess.remember(folder)
            UserDefaults.standard.set(folder.standardizedFileURL.path, forKey: Self.documentsKey)
            self.createUntitled(in: folder)
            finished()
        }
    }

    private func createUntitled(in folder: URL) {
        let fm = FileManager.default
        var url = folder.appendingPathComponent("untitled.txt")
        var number = 2
        while fm.fileExists(atPath: url.path) {
            url = folder.appendingPathComponent("untitled \(number).txt")
            number += 1
        }
        guard fm.createFile(atPath: url.path, contents: Data()) else {
            return notify("Typewrencher doesn't have permission to create a document in “\(folder.lastPathComponent)”.")
        }
        openNow(url, createdUntitled: true)
    }

    private var untitled: Set<String> { Set(UserDefaults.standard.stringArray(forKey: Self.untitledKey) ?? []) }
    private func isUntitled(_ url: URL) -> Bool { untitled.contains(url.standardizedFileURL.path) }
    private func setUntitled(_ url: URL, _ on: Bool) {
        var all = untitled
        if on { all.insert(url.standardizedFileURL.path) } else { all.remove(url.standardizedFileURL.path) }
        UserDefaults.standard.set(Array(all), forKey: Self.untitledKey)
    }

    // An untitled file this app created and that is still empty (zero bytes) goes to the Trash when the
    // person leaves it. No other file is ever removed.
    private func trashIfEmptyUntitled(_ url: URL) {
        guard isUntitled(url) else { return }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue
        guard size == 0 else { if size == nil { setUntitled(url, false) }; return }
        if (try? FileManager.default.trashItem(at: url, resultingItemURL: nil)) != nil { setUntitled(url, false) }
    }

    // MARK: Renaming

    // The page's name field: rename the file in its folder. A refused rename sends the old name back to
    // the page, says why on the notice line, and reports an error (the reply to the page's message).
    private func rename(to raw: String, done: @escaping (String?) -> Void) {
        guard let url = fileURL else { return done(nil) }
        let clean = Self.cleanName(raw)
        guard !clean.isEmpty, clean != name else { push(); return done(nil) }   // nothing to rename
        let folder = url.deletingLastPathComponent()
        guard FolderAccess.url(for: folder) != nil else {
            // The sandbox only lets the app rename inside a folder the person has granted.
            askForFolder(folder) { granted in
                if granted { self.sendFiles(); return self.rename(to: raw, done: done) }
                self.push()
                self.notify("Typewrencher needs access to “\(folder.lastPathComponent)” to rename files there.")
                done("no folder access")
            }
            return
        }
        let target = folder.appendingPathComponent(clean + ".txt").standardizedFileURL
        let caseOnly = target.path.lowercased() == url.path.lowercased()   // "poem" to "Poem"
        if !caseOnly, FileManager.default.fileExists(atPath: target.path) {
            push()
            notify("A file named \(clean) already exists.")
            return done("exists")
        }
        guard saveNow() else { push(); return done("save failed") }
        renaming = true; fileWatcher = nil
        defer { renaming = false; watchFile() }
        do {
            try Self.move(url, to: target, caseOnly: caseOnly)
        } catch {
            push()
            notify("Typewrencher couldn't rename \(name): \(Self.reason(error)).")
            return done("failed")
        }
        setUntitled(url, false)   // a named file is kept even when empty
        FileAccess.stop(url)
        fileURL = target
        remember(target)
        push()
        showInWindow()
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

    // Like the page's export name: no path or reserved characters, no ".txt", no spaces or dots at the ends.
    static func cleanName(_ raw: String) -> String {
        var name = raw.unicodeScalars.filter { $0.value >= 0x20 && !"\\/:*?\"<>|".unicodeScalars.contains($0) }
            .map(String.init).joined()
        if name.lowercased().hasSuffix(".txt") { name.removeLast(4) }
        return name.trimmingCharacters(in: CharacterSet(charactersIn: " .").union(.whitespacesAndNewlines))
    }

    // MARK: Changes from outside the app

    private func watchFile() {
        fileWatcher = nil
        guard let url = fileURL else { return }
        fileWatcher = PathWatcher(path: url) { [weak self] in self?.fileChangedOnDisk() }
    }

    // The current file changed on disk. This app's own saves read back as savedText and are ignored.
    // The page holds typing for about 300 ms before sending it, so its current text is asked for first:
    // typing that has not arrived yet still counts as the person's change and is kept.
    private func fileChangedOnDisk() {
        guard !renaming, let url = fileURL else { return }
        watchFile()   // a replaced file needs a new watch
        guard let disk = try? TextFile.read(url) else {
            if !FileManager.default.fileExists(atPath: url.path) {
                notify("\(name) was moved or deleted outside Typewrencher. Your text is still here; use Save As… to keep it.", sticky: true)
            }
            return
        }
        guard disk != savedText else { return }
        currentText { _ in
            guard url == self.fileURL else { return }   // switched away meanwhile
            if self.text != self.savedText {
                self.savedText = disk   // the person's text is written over the outside change
                self.scheduleSave()
                self.notify("Typewrencher kept your changes; the file was also changed elsewhere.")
            } else {
                self.text = disk
                self.savedText = disk
                self.push(newText: true)
            }
        }
    }

    // MARK: Showing the document

    // Shows the document's text and name in the page. newText: a different text replaced the old one
    // (another file, or the file reloaded), so the web view's undo history is cleared; otherwise Cmd-Z
    // would replay edits from the previous text into this one. Only the name changed: undo is kept.
    private func push(newText: Bool = false) {
        guard pageReady, let web else { return }
        let args: [String: Any] = ["text": text, "name": name]
        guard let json = try? JSONSerialization.data(withJSONObject: args), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setDocument(\(js))") { _, _ in
            if newText { web.undoManager?.removeAllActions() }
            self.leaving = nil   // the page shows this file now
        }
    }

    private func showInWindow() {
        state.title = name.isEmpty ? "Typewrencher" : name
        state.fileURL = fileURL
        window?.representedURL = fileURL   // the title bar's file icon
    }

    // A short message on the page's notice line; queued until the page is ready. A sticky message stays
    // until replaced (used while a save keeps failing); notify("") clears the line.
    func notify(_ message: String, sticky: Bool = false) {
        guard pageReady, let web else { return queuedNotes.append((message, sticky)) }
        guard let json = try? JSONSerialization.data(withJSONObject: [message]), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.notify(\(js)[0], { sticky: \(sticky) })")
    }

    private static func reason(_ error: Error) -> String {
        let nsError = error as NSError
        if nsError.domain == NSCocoaErrorDomain, [257, 513].contains(nsError.code) { return "no permission" }
        if nsError.domain == NSCocoaErrorDomain, [4, 260].contains(nsError.code) { return "the file is missing" }
        let text = error.localizedDescription
        return text.hasSuffix(".") ? String(text.dropLast()) : text
    }

    // MARK: The files drawer

    // Send the page the .txt files in the document's folder, and watch the folder while the drawer is open.
    func sendFiles() {
        guard pageReady, filesOpen, let web else { return }
        var state: [String: Any] = ["access": "none"]
        if let file = fileURL {
            let folder = file.deletingLastPathComponent()
            state = ["access": "needed", "folder": folder.lastPathComponent,
                     "path": FolderAccess.displayPath(folder), "current": file.lastPathComponent]
            if let url = FolderAccess.url(for: folder), let files = FolderAccess.textFiles(in: url) {
                state["access"] = "granted"
                state["files"] = files.map { ["name": $0.name, "modified": ($0.modified.timeIntervalSince1970 * 1000).rounded()] }
                if watchedFolder != folder {
                    folderWatcher = PathWatcher(path: url) { [weak self] in self?.sendFiles() }
                    watchedFolder = folder
                }
            }
        }
        guard let json = try? JSONSerialization.data(withJSONObject: state), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.setFiles && window.TypewrencherHost.setFiles(\(js))")
    }

    // MARK: The Trash

    private var trashed: [String: (original: URL, inTrash: URL)] = [:]   // undoId -> where the file was and where it is now

    // The page's trash button: move a file in the document's folder to the Trash (a person can still take it out
    // there). The reply is { ok, undoId } or an error: a short reason that the page shows inline. The folder
    // must be granted, as for renaming. Trashing the open document first saves its newest text (so Undo brings
    // back everything typed) and switches the window to a new empty document; a save that fails refuses.
    private func trash(_ name: String, reply: @escaping (Any?, String?) -> Void) {
        guard !name.isEmpty, !name.contains("/"), let folder = fileURL?.deletingLastPathComponent() else { return reply(nil, "no such file") }
        guard FolderAccess.url(for: folder) != nil else { return reply(nil, "Typewrencher has no access to this folder") }
        let target = folder.appendingPathComponent(name).standardizedFileURL
        let isOpen = target == fileURL
        let go = {
            guard FileManager.default.fileExists(atPath: target.path) else { self.sendFiles(); return reply(nil, "the file is already gone") }
            if isOpen { guard self.saveNow() else { return reply(nil, "its newest text could not be saved first") } }
            var inTrash: NSURL?
            if isOpen { self.fileWatcher = nil }   // the file leaving is not a change from outside
            do { try FileManager.default.trashItem(at: target, resultingItemURL: &inTrash) } catch {
                if isOpen { self.watchFile() }
                self.sendFiles()
                return reply(nil, Self.reason(error))
            }
            self.setUntitled(target, false)
            var answer: [String: Any] = ["ok": true]
            if let inTrash {
                let id = UUID().uuidString
                self.trashed[id] = (target, inTrash as URL)
                answer["undoId"] = id
            }
            if isOpen { self.createUntitled(in: folder) } else { self.sendFiles() }
            reply(answer, nil)
        }
        if isOpen { currentText { _ in go() } } else { go() }
    }

    // Undo: move the file back from the Trash to its original path, never over a file that is there now.
    private func untrash(_ id: String, reply: @escaping (Any?, String?) -> Void) {
        guard let item = trashed[id] else { return reply(nil, "it can no longer be restored") }
        let fm = FileManager.default
        guard FolderAccess.url(for: item.original.deletingLastPathComponent()) != nil else { return reply(nil, "Typewrencher has no access to the folder") }
        guard fm.fileExists(atPath: item.inTrash.path) else { return reply(nil, "it is no longer in the Trash") }
        guard !fm.fileExists(atPath: item.original.path) else { return reply(nil, "a file with that name is in the folder now, so this one stays in the Trash") }
        do { try fm.moveItem(at: item.inTrash, to: item.original) } catch { return reply(nil, Self.reason(error)) }
        trashed[id] = nil
        sendFiles()
        reply(["ok": true], nil)
    }

    // An Open panel already showing the folder, so one click grants it; FolderAccess keeps the choice.
    private func askForFolder(_ folder: URL, done: @escaping (Bool) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = folder
        panel.prompt = "Allow Access"
        panel.message = "Allow Typewrencher to work with the files in “\(folder.lastPathComponent)”."
        run(panel, ifCancelled: { done(false) }) { url in
            FolderAccess.remember(url)
            done(FolderAccess.url(for: folder) != nil)
        }
    }

    // MARK: Panels

    // The native file panels are the file-access boundary, so they stay; they attach to the window.
    private func run(_ panel: NSSavePanel, ifCancelled: (() -> Void)? = nil, then: @escaping (URL) -> Void) {
        let finish = { (response: NSApplication.ModalResponse) in
            guard response == .OK, let url = panel.url else { ifCancelled?(); return }
            then(url)
        }
        if let window { panel.beginSheetModal(for: window, completionHandler: finish) } else { panel.begin(completionHandler: finish) }
    }

    // The page's Export button: ask where to save a copy. A cancelled panel rejects with "declined", which
    // js/host.js turns into the page's quiet "person cancelled" path.
    private func export(filename: String, data: String, reply: @escaping (Any?, String?) -> Void) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = filename
        run(panel, ifCancelled: { reply(nil, "declined") }) { url in
            do {
                try Data(data.utf8).write(to: url, options: .atomic)
                reply(nil, nil)
            } catch {
                reply(nil, "failed: \(error.localizedDescription)")
            }
        }
    }
}

// Tells the session which window it lives in once SwiftUI puts it in one.
final class EditorWebView: WKWebView {
    var onWindow: ((NSWindow?) -> Void)?
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        onWindow?(window)
    }
}
