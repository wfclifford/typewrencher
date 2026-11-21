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
//   page -> native: ready, textChanged, export, open, new, rename, close, files, grantFolder, openFile
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
    private var queuedNotes: [String] = []        // messages from before the page was ready
    private var pendingOpen: URL?                  // a Finder or Dock open that arrived before the page

    private var fileURL: URL?                      // the current document
    private var text = ""                          // its newest text, from the page
    private var savedText = ""                     // its text on disk, as far as this app knows
    private var saveWork: DispatchWorkItem?
    private var fileWatcher: PathWatcher?
    private var renaming = false

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
            notes.forEach(notify)
            replyHandler(nil, nil)
        case "textChanged":
            if let newText = body["text"] as? String { text = newText; scheduleSave() }
            replyHandler(nil, nil)
        case "export":
            export(filename: body["filename"] as? String ?? "title.txt", data: body["data"] as? String ?? "", reply: replyHandler)
        case "open":
            showOpenPanel(); replyHandler(nil, nil)
        case "new":
            newDocument(); replyHandler(nil, nil)
        case "rename":
            rename(to: body["name"] as? String ?? "", reply: replyHandler)
        case "close":
            window?.performClose(nil); replyHandler(nil, nil)   // no longer sent by the page; still handled
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
        default:
            replyHandler(nil, "unknown message type")
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
        if let url = pendingOpen { pendingOpen = nil; if switchTo(url) { return } }
        if let last = FileAccess.lastFile {
            if FileManager.default.fileExists(atPath: last.path), switchTo(last) { return }
            notify("Typewrencher couldn't reopen \(last.deletingPathExtension().lastPathComponent).")
        }
        newDocument()
    }

    // The one way to open a file: save the current one, read the new one, then show it everywhere.
    // On any failure the current file stays open and the person is told on the notice line.
    @discardableResult
    func switchTo(_ target: URL, createdUntitled: Bool = false) -> Bool {
        let url = target.standardizedFileURL
        if url == fileURL { push(); return true }
        guard saveNow() else { return false }
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

    // Writes the newest text if it differs from the file. False (and a notice) when writing fails.
    @discardableResult
    func saveNow() -> Bool {
        saveWork?.cancel(); saveWork = nil
        guard let url = fileURL, text != savedText else { return true }
        do {
            let atomically = FolderAccess.url(for: url.deletingLastPathComponent()) != nil
            try TextFile.write(text, to: url, atomically: atomically)
            savedText = text
            return true
        } catch {
            notify("Typewrencher couldn't save \(name): \(Self.reason(error)).")
            return false
        }
    }

    // File > Save: take the page's text as it is this moment (even mid-typing) and write it now.
    func saveFromMenu() {
        currentText { _ in self.saveNow() }
    }

    // File > Save As…: write the text to a new file the person chooses, then switch to it.
    func saveAs() {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.plainText]
        panel.nameFieldStringValue = (name.isEmpty ? "untitled" : name) + ".txt"
        if let folder = fileURL?.deletingLastPathComponent() { panel.directoryURL = folder }
        run(panel) { url in
            self.currentText { text in
                do {
                    try TextFile.write(text, to: url, atomically: true)
                } catch {
                    self.notify("Typewrencher couldn't save \(url.deletingPathExtension().lastPathComponent): \(Self.reason(error)).")
                    return
                }
                self.switchTo(url)
            }
        }
    }

    // File > Export…: the same as the page's Export button.
    func exportFromMenu() {
        web?.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.exportNow()")
    }

    // The page's current text, which may be newer than its last textChanged message.
    private func currentText(_ done: @escaping (String) -> Void) {
        guard pageReady, let web else { return done(text) }
        web.evaluateJavaScript("window.TypewrencherHost.getText()") { result, _ in
            if let newText = result as? String { self.text = newText }
            done(self.text)
        }
    }

    // Quitting (or closing the window, which quits): save the newest text and trash an empty untitled
    // file. If the save fails, the app stays open with the message showing.
    func prepareToQuit(_ done: @escaping (Bool) -> Void) {
        var finished = false
        let finish = { (ok: Bool) in if !finished { finished = true; done(ok) } }
        currentText { _ in
            guard self.saveNow() else { return finish(false) }
            if let url = self.fileURL { self.trashIfEmptyUntitled(url) }
            finish(true)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { finish(self.saveNow()) }   // the page did not answer
    }

    // MARK: New documents

    // The "+" button and File > New: a new empty file named "untitled.txt" (or "untitled 2.txt", ...) in
    // the current file's folder, or in the documents folder when the app may not write there.
    func newDocument() {
        if let url = fileURL, isUntitled(url), text.isEmpty, savedText.isEmpty { return }   // already a blank page
        guard saveNow() else { return }
        if let folder = fileURL?.deletingLastPathComponent(), FolderAccess.url(for: folder) != nil {
            createUntitled(in: folder)
        } else if let path = UserDefaults.standard.string(forKey: Self.documentsKey),
                  FolderAccess.url(for: URL(fileURLWithPath: path)) != nil {
            createUntitled(in: URL(fileURLWithPath: path))
        } else {
            chooseDocumentsFolder()
        }
    }

    private func chooseDocumentsFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose"
        panel.message = "Choose a folder for new documents"
        run(panel, ifCancelled: { self.notify("Choose a folder to create new documents in.") }) { folder in
            FolderAccess.remember(folder)
            UserDefaults.standard.set(folder.standardizedFileURL.path, forKey: Self.documentsKey)
            self.createUntitled(in: folder)
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
        switchTo(url, createdUntitled: true)
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
    // the page and replies with an error.
    private func rename(to raw: String, reply: @escaping (Any?, String?) -> Void) {
        guard let url = fileURL else { return reply(nil, nil) }
        let clean = Self.cleanName(raw)
        guard !clean.isEmpty, clean != name else { push(); return reply(nil, nil) }   // nothing to rename
        let folder = url.deletingLastPathComponent()
        guard FolderAccess.url(for: folder) != nil else {
            // The sandbox only lets the app rename inside a folder the person has granted.
            askForFolder(folder) { granted in
                if granted { self.rename(to: raw, reply: reply); self.sendFiles(); return }
                self.push()
                self.notify("Typewrencher needs access to “\(folder.lastPathComponent)” to rename files there.")
                reply(nil, "no folder access")
            }
            return
        }
        let target = folder.appendingPathComponent(clean + ".txt").standardizedFileURL
        let caseOnly = target.path.lowercased() == url.path.lowercased()
        if !caseOnly, FileManager.default.fileExists(atPath: target.path) {
            push()
            notify("A file named \(clean) already exists.")
            return reply(nil, "exists")
        }
        guard saveNow() else { push(); return reply(nil, "save failed") }
        renaming = true; fileWatcher = nil
        defer { renaming = false; watchFile() }
        do {
            try FileManager.default.moveItem(at: url, to: target)
        } catch {
            push()
            notify("Typewrencher couldn't rename \(name): \(Self.reason(error)).")
            return reply(nil, "failed")
        }
        setUntitled(url, false)   // a named file is kept even when empty
        FileAccess.stop(url)
        fileURL = target
        remember(target)
        push()
        showInWindow()
        sendFiles()
        reply(nil, nil)
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
            if !FileManager.default.fileExists(atPath: url.path) { notify("\(name) was moved or deleted outside Typewrencher.") }
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
        }
    }

    private func showInWindow() {
        state.title = name.isEmpty ? "Typewrencher" : name
        state.fileURL = fileURL
        window?.representedURL = fileURL   // the title bar's file icon
    }

    // A short message on the page's notice line; queued until the page is ready.
    func notify(_ message: String) {
        guard pageReady, let web else { return queuedNotes.append(message) }
        guard let json = try? JSONSerialization.data(withJSONObject: [message]), let js = String(data: json, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.TypewrencherHost && window.TypewrencherHost.notify(\(js)[0])")
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
