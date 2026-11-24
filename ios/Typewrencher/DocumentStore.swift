import UIKit
import UniformTypeIdentifiers

// The app's own Documents folder, which the Files app shows under Typewrencher (see Info.plist), and the record
// of which document was open last. Phase 2a keeps every document here; a chosen folder comes later.
struct DocumentStore {
    private static let lastKey = "lastDocumentName"
    let folder: URL

    init(folder: URL = .documentsDirectory) { self.folder = folder }

    // "Poem" for Poem.txt, as the page's name field shows it.
    static func displayName(_ url: URL) -> String { url.deletingPathExtension().lastPathComponent }

    // Only the file's name is remembered: the container's path changes between installs and updates.
    var lastFile: URL? {
        guard let name = UserDefaults.standard.string(forKey: Self.lastKey), !name.contains("/") else { return nil }
        let url = folder.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func remember(_ url: URL) { UserDefaults.standard.set(url.lastPathComponent, forKey: Self.lastKey) }

    // The .txt files in the folder, newest first, for the files drawer.
    func textFiles() -> [(name: String, modified: Date)] {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .contentTypeKey, .isRegularFileKey]
        guard let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys,
                                                                       options: [.skipsHiddenFiles]) else { return [] }
        return urls.compactMap { url -> (name: String, modified: Date)? in
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                  values.contentType == .plainText || url.pathExtension.lowercased() == "txt" else { return nil }
            return (url.lastPathComponent, values.contentModificationDate ?? .distantPast)
        }
        .sorted { $0.modified > $1.modified }
    }

    // The Files app shows the app's Documents folder under the app's name, so the drawer does too.
    var folderLabel: String { "Typewrencher" }

    // Where the folder is in the Files app, for the drawer's last line.
    var displayPath: String {
        (UIDevice.current.userInterfaceIdiom == .pad ? "On My iPad" : "On My iPhone") + "/" + folderLabel
    }

    // Like the page's export name: no path or reserved characters, no ".txt", no spaces or dots at the ends.
    static func cleanName(_ raw: String) -> String {
        var name = raw.unicodeScalars.filter { $0.value >= 0x20 && !"\\/:*?\"<>|".unicodeScalars.contains($0) }
            .map(String.init).joined()
        if name.lowercased().hasSuffix(".txt") { name.removeLast(4) }
        return name.trimmingCharacters(in: CharacterSet(charactersIn: " .").union(.whitespacesAndNewlines))
    }

    // The untitled files this app created. Only these, and only while they are still empty, are ever removed.
    private static let untitledKey = "untitledFiles"
    private var untitled: Set<String> { Set(UserDefaults.standard.stringArray(forKey: Self.untitledKey) ?? []) }
    func isUntitled(_ url: URL) -> Bool { untitled.contains(url.lastPathComponent) }
    func setUntitled(_ url: URL, _ on: Bool) {
        var all = untitled
        if on { all.insert(url.lastPathComponent) } else { all.remove(url.lastPathComponent) }
        UserDefaults.standard.set(Array(all), forKey: Self.untitledKey)
    }

    // An untitled file this app created that is still empty (zero bytes) is deleted when the person leaves it.
    // iOS has no Trash for an app's own files; nothing is lost, the file has no content. Any other file is kept.
    func removeIfEmptyUntitled(_ url: URL) {
        guard isUntitled(url) else { return }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue
        guard size == 0 else { if size == nil { setUntitled(url, false) }; return }
        if (try? FileManager.default.removeItem(at: url)) != nil { setUntitled(url, false) }
    }

    // untitled.txt, untitled 2.txt, ... the first name that is free.
    func createUntitled() throws -> URL {
        let fm = FileManager.default
        var url = folder.appendingPathComponent("untitled.txt")
        var number = 2
        while fm.fileExists(atPath: url.path) {
            url = folder.appendingPathComponent("untitled \(number).txt")
            number += 1
        }
        guard fm.createFile(atPath: url.path, contents: Data()) else {
            throw CocoaError(.fileWriteNoPermission)
        }
        return url
    }
}
