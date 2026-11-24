import Foundation

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
