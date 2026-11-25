import UIKit
import WebKit

// The one open document and the page that edits it. Phase 2a: reopen the last document (or start untitled.txt) when the
// page is ready, save what is typed, and switch, create and rename documents in the app's Documents folder, which the
// files drawer lists. Export comes in a later step. Behavior follows mac/Typewrencher/EditorSession.swift, without the
// AppKit parts.
final class EditorSession {
    static let shared = EditorSession()

    weak var web: WKWebView?
    private var store: DocumentStore
    private var held: [URL] = []       // folders access has been started for; kept while they are the documents folder or hold the open file
    private var picker: NSObject?       // the folder or file picker, held while it is showing (its delegate is weak)
    private var fileAccess: URL?        // a file picked with Open, whose own access is kept while it is the open file
    private var launchNotice: String?   // said once the page is ready: the chosen folder could not be reached
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

    // At launch the chosen folder, if one was remembered and can still be reached; otherwise the app's own folder.
    init() {
        if let folder = ChosenFolder.resolve() {
            held = [folder]
            store = DocumentStore(folder: folder)
        } else {
            store = DocumentStore()
            if ChosenFolder.isRemembered {
                // The bookmark is kept: an unavailable drive or a folder that is back later works again. Until then the
                // app's own folder is used, and the person is told.
                launchNotice = Self.lostNotice(ChosenFolder.rememberedName)
            }
        }
    }

    // The page has started (bridge message "ready"). The first time, show the last document or a new one; if the
    // page reloads and says ready again, show the document that is already open.
    func pageReady() {
        filesOpen = false   // a reloaded page says again whether its drawer is open
        if !launched {
            launched = true
            launch()
            if let notice = launchNotice { launchNotice = nil; notify(notice) }
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
        releaseFileAccessIfLeft()
        releaseUnusedFolders()
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
        let target = url.deletingLastPathComponent().appendingPathComponent(clean + ".txt").standardizedFileURL   // the file's own folder
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
            if FileManager.default.fileExists(atPath: old.path), !ChosenFolder.isInTrash(old) { try? TextFile.write(newText, to: old) }
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
            // A file the person deleted in the Files app is moved to Recently Deleted and the URL we hold can follow it there;
            // new text must not be written into the trash, where it would be emptied away in about 30 days. It stays unsaved,
            // on the page, and is kept as a new file in the app's folder when the app notices (leaveFolderIfLost).
            guard FileManager.default.fileExists(atPath: url.path), !ChosenFolder.isInTrash(url) else { throw MovedOrDeleted() }
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

    // MARK: Export

    // The page's Export button (bridge message "export"): a copy of the text as a .txt file, handed to the system share
    // sheet, which is the one exit from the writing surface the project accepts (iOS has no other way to save a copy
    // somewhere the person chooses). The reply is nil once the copy was shared or saved, "declined" if the sheet was
    // closed without choosing anything (the page then says nothing), or a short reason if the file could not be made.
    func export(filename: String, data: String, reply: @escaping (String?) -> Void) {
        let name = (filename as NSString).lastPathComponent
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = folder.appendingPathComponent(name.isEmpty ? "title.txt" : name)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try Data(data.utf8).write(to: file, options: .atomic)
        } catch {
            return reply("failed: \(Self.reason(error))")
        }
        guard let top = Self.topViewController() else {
            try? FileManager.default.removeItem(at: folder)
            return reply("failed: nothing to show the share sheet on")
        }
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.completionWithItemsHandler = { _, completed, _, error in
            try? FileManager.default.removeItem(at: folder)
            if let error { reply("failed: \(Self.reason(error))") } else { reply(completed ? nil : "declined") }
        }
        // On an iPad the sheet is a popover; anchor it near the top, where the Export button is.
        if let popover = sheet.popoverPresentationController, let view = top.view {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.maxX - 120, y: view.safeAreaInsets.top + 40, width: 1, height: 1)
            popover.permittedArrowDirections = .up
        }
        top.present(sheet, animated: true)
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    // MARK: Opening a file from anywhere

    // The page's Open button (bridge message "open"): show the system file picker for one .txt. The file opens and saves
    // where it is, in turn with other operations like any switch. Backing out changes nothing and says nothing.
    func chooseFile() {
        guard picker == nil, let top = Self.topViewController() else { return }
        let chooser = FilePicker { [weak self] file in
            self?.picker = nil
            if let file { self?.openPicked(file) }
        }
        picker = chooser
        chooser.present(on: top)
    }

    private func openPicked(_ file: URL) {
        let started = file.startAccessingSecurityScopedResource()
        perform { finished in
            self.currentText { _ in
                if self.openNow(file) {
                    self.fileAccess = started ? file : nil   // kept for as long as this is the open file
                } else if started {
                    file.stopAccessingSecurityScopedResource()
                }
                finished()
            }
        }
    }

    // Ends the access given for a file picked with Open once another file is the open one.
    private func releaseFileAccessIfLeft() {
        guard let access = fileAccess, access.standardizedFileURL != fileURL?.standardizedFileURL else { return }
        access.stopAccessingSecurityScopedResource()
        fileAccess = nil
    }

    // MARK: Choosing the documents folder

    // The drawer's "Choose folder" button (bridge message "chooseFolder"): show the system folder picker. Backing out
    // changes nothing and says nothing. Choosing the app's own folder goes back to the default.
    func chooseFolder() {
        guard picker == nil, let top = Self.topViewController() else { return }
        let chooser = FolderPicker { [weak self] folder in
            self?.picker = nil
            if let folder { self?.folderChosen(folder) }
        }
        picker = chooser
        chooser.present(on: top)
    }

    // The folder the picker returned becomes the documents folder, in turn with other operations: the open document is
    // saved first (if that fails nothing changes), then the app moves to a document in the new folder and says so. Access
    // to the folder the open document was in is kept until it is left.
    private func folderChosen(_ folder: URL) {
        let started = folder.startAccessingSecurityScopedResource()
        let isAppFolder = DocumentStore.sameFolder(folder, DocumentStore.appFolder)
        if !isAppFolder && !started {
            return notify("Typewrencher couldn\u{2019}t get access to \(folder.lastPathComponent).")
        }
        let endAccess = { if started { folder.stopAccessingSecurityScopedResource() } }
        perform { finished in
            self.currentText { _ in
                guard self.saveNow() else { endAccess(); return finished() }
                if isAppFolder {
                    ChosenFolder.clear()
                    endAccess()
                } else {
                    do { try ChosenFolder.save(folder) } catch {
                        endAccess()
                        self.notify("Typewrencher couldn\u{2019}t remember \(folder.lastPathComponent): \(Self.reason(error)).")
                        return finished()
                    }
                    self.hold(folder)
                }
                self.switchStore(to: isAppFolder ? DocumentStore() : DocumentStore(folder: folder))
                finished()
            }
        }
    }

    // Moves to a document in the new documents folder and tells the person where the earlier ones are.
    private func switchStore(to new: DocumentStore) {
        let old = store
        store = new
        guard !DocumentStore.sameFolder(old.folder, new.folder) else {   // the same folder chosen again
            releaseUnusedFolders()
            return sendFiles()
        }
        openFirstDocument()
        releaseUnusedFolders()
        sendFiles()
        if new.isAppFolder {   // so the folder left was a chosen one
            notify("Now using the Typewrencher folder. Your documents in \u{201c}\(old.folderLabel)\u{201d} are still there.")
        } else {
            let earlier = old.isAppFolder ? "the Typewrencher folder in Files" : "\u{201c}\(old.folderLabel)\u{201d}"
            notify("Now using \u{201c}\(new.folderLabel)\u{201d}. Your earlier documents are still in \(earlier).")
        }
    }

    // The document to show in a folder just switched to: the one open there last, else the newest .txt, else a new
    // untitled file. A file that cannot be read is skipped (openNow says why), up to five of them.
    private func openFirstDocument() {
        var candidates: [URL] = []
        if let last = store.lastFile { candidates.append(last) }
        for file in store.textFiles() {
            let url = store.folder.appendingPathComponent(file.name)
            if !candidates.contains(url) { candidates.append(url) }
        }
        for url in candidates.prefix(5) where openNow(url) { return }
        createUntitledDocument()
    }

    // Remembers a folder access was started for. A folder already held is not held twice: the extra start is ended.
    private func hold(_ folder: URL) {
        if held.contains(where: { DocumentStore.sameFolder($0, folder) }) {
            folder.stopAccessingSecurityScopedResource()
        } else {
            held.append(folder)
        }
    }

    // Ends access to every held folder that is neither the documents folder nor the one the open file is in.
    private func releaseUnusedFolders() {
        let fileFolder = fileURL?.deletingLastPathComponent()
        held.removeAll { folder in
            let needed = DocumentStore.sameFolder(folder, store.folder) || (fileFolder.map { DocumentStore.sameFolder(folder, $0) } ?? false)
            if !needed { folder.stopAccessingSecurityScopedResource() }
            return !needed
        }
    }

    // MARK: The files drawer

    // The page's drawer opened or closed (bridge message "files"): while it is open, send the list.
    func filesDrawer(open: Bool) {
        filesOpen = open
        if open { sendFiles() }
    }

    // The app came back to the foreground: files may have been added, moved or deleted in the Files app.
    // If the documents folder is gone (deleted, in Recently Deleted, an unplugged drive) the app moves to its own folder.
    func refreshFiles() {
        if !leaveFolderIfLost() { sendFiles() }
    }

    private static func lostNotice(_ name: String?) -> String {
        let folder = name.map { "\u{201c}\($0)\u{201d}" } ?? "The folder you chose"
        return "\(folder) was deleted or can\u{2019}t be reached, so Typewrencher is using its own folder. Choose a folder again to go back."
    }

    // True if the documents folder was lost and the app is moving to its own folder. The open document's text is never
    // dropped: if it could not be saved (its file went with the folder), it is first kept as a file in the app's folder.
    private func leaveFolderIfLost() -> Bool {
        guard launched, !store.isAppFolder, !ChosenFolder.isReachable(store.folder) else { return false }
        let lostName = store.folderLabel
        perform { finished in
            self.currentText { _ in
                var kept: String?
                if let url = self.fileURL, self.text != self.savedText {
                    do {
                        let copy = try DocumentStore().createFile(named: DocumentStore.displayName(url), text: self.text)
                        self.savedText = self.text   // it is saved, in the new place
                        kept = copy.deletingPathExtension().lastPathComponent
                    } catch {
                        // Not even that worked: stay where we are, the text is still on the page, and say so.
                        self.notify("Typewrencher couldn\u{2019}t reach \u{201c}\(lostName)\u{201d}, and couldn\u{2019}t keep your text elsewhere: \(Self.reason(error)). Your text is still on the page; Export keeps a copy.", sticky: true)
                        return finished()
                    }
                }
                self.store = DocumentStore()   // the bookmark stays: a folder that comes back works again at the next launch
                self.openFirstDocument()
                self.releaseUnusedFolders()
                self.sendFiles()
                let note = Self.lostNotice(lostName)
                self.notify(kept.map { note + " A copy of your latest text is in the Typewrencher folder as \u{201c}\($0)\u{201d}." } ?? note)
                finished()
            }
        }
        return true
    }

    // Sends the page the .txt files in the Documents folder (TypewrencherHost.setFiles).
    private func sendFiles() {
        guard launched, filesOpen, let web, let file = fileURL else { return }
        let files = store.textFiles().map { ["name": $0.name, "modified": ($0.modified.timeIntervalSince1970 * 1000).rounded()] as [String: Any] }
        // The open file is highlighted only if it is in the listed folder (a file in another folder may share a name).
        let inListedFolder = DocumentStore.sameFolder(file.deletingLastPathComponent(), store.folder)
        let state: [String: Any] = ["access": "granted", "folder": store.folderLabel, "path": store.displayPath,
                                    "current": inListedFolder ? file.lastPathComponent : "", "files": files,
                                    "trash": false,          // this app has no Trash for its files: the page draws no trash buttons
                                    "chooseFolder": true]    // and it can show a folder picker: the page draws the Choose folder button
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
