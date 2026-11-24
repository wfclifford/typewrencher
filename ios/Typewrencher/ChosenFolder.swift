import UIKit
import UniformTypeIdentifiers

// The folder the person chose for their documents, remembered between launches as a bookmark (the only way iOS lets an
// app return to a folder outside its own container). The app's own Documents folder is the default and needs none.
enum ChosenFolder {
    private static let key = "chosenFolderBookmark", nameKey = "chosenFolderName"

    // Remember a folder the document picker returned. The caller has started access to it.
    static func save(_ folder: URL) throws {
        UserDefaults.standard.set(try folder.bookmarkData(), forKey: key)
        UserDefaults.standard.set(folder.lastPathComponent, forKey: nameKey)   // for the message if it cannot be reached later
    }

    // Go back to the app's own folder.
    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
        UserDefaults.standard.removeObject(forKey: nameKey)
    }

    // A folder was chosen before (whether or not it can be reached now), and what it was called.
    static var isRemembered: Bool { UserDefaults.standard.data(forKey: key) != nil }
    static var rememberedName: String? { UserDefaults.standard.string(forKey: nameKey) }

    // The remembered folder with access started (the caller stops it when the folder is no longer used), or nil when none
    // is remembered or it can no longer be reached: deleted, moved, an unavailable drive, a bookmark iOS no longer honors.
    static func resolve() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        var stale = false
        guard let folder = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale),
              folder.startAccessingSecurityScopedResource() else { return nil }
        var isFolder: ObjCBool = false
        guard FileManager.default.fileExists(atPath: folder.path, isDirectory: &isFolder), isFolder.boolValue else {
            folder.stopAccessingSecurityScopedResource()
            return nil
        }
        if stale { try? save(folder) }   // iOS says the bookmark is getting old: replace it while it still works
        return folder
    }
}

// Shows the system folder picker and reports the folder the person chose, or nil if they backed out.
final class FolderPicker: NSObject, UIDocumentPickerDelegate {
    private let done: (URL?) -> Void

    init(done: @escaping (URL?) -> Void) { self.done = done }

    func present(on top: UIViewController) {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        picker.delegate = self
        picker.allowsMultipleSelection = false
        top.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls.first) }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
}
