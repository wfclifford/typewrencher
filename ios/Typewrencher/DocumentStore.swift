import UIKit
import UniformTypeIdentifiers

// The folder documents live in, and what is remembered about the files in it. By default that is the app's own
// Documents folder, which the Files app shows under Typewrencher (see Info.plist); the person can choose another
// folder instead (ChosenFolder.swift). Everything remembered about a file (the last document, the untitled files this
// app created) is keyed by the file's folder, so a file in one folder is never taken for a same-named file in another.
struct DocumentStore {
    static let appFolder = URL.documentsDirectory
    private static let lastKey = "lastDocumentNames"   // [folder key: file name]

    let folder: URL

    init(folder: URL = DocumentStore.appFolder) { self.folder = folder }

    // "Poem" for Poem.txt, as the page's name field shows it.
    static func displayName(_ url: URL) -> String { url.deletingPathExtension().lastPathComponent }

    // MARK: Which folder

    static func sameFolder(_ a: URL, _ b: URL) -> Bool {
        a.standardizedFileURL.resolvingSymlinksInPath().path == b.standardizedFileURL.resolvingSymlinksInPath().path
    }

    var isAppFolder: Bool { Self.sameFolder(folder, Self.appFolder) }

    // "app" for the app's own folder (its container's path changes between installs and updates), else the folder's path.
    static func folderKey(_ folder: URL) -> String {
        sameFolder(folder, appFolder) ? "app" : folder.standardizedFileURL.resolvingSymlinksInPath().path
    }

    private static func key(of file: URL) -> String { folderKey(file.deletingLastPathComponent()) }

    // MARK: The last document

    // Only the file's name is remembered, with its folder's key. Earlier versions kept one name for the app folder.
    private static var lastNames: [String: String] {
        var names = UserDefaults.standard.dictionary(forKey: lastKey) as? [String: String] ?? [:]
        if names["app"] == nil, let old = UserDefaults.standard.string(forKey: "lastDocumentName") { names["app"] = old }
        return names
    }

    var lastFile: URL? {
        guard let name = Self.lastNames[Self.folderKey(folder)], !name.contains("/"), !name.isEmpty else { return nil }
        let url = folder.appendingPathComponent(name)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func remember(_ url: URL) {
        var names = Self.lastNames
        names[Self.key(of: url)] = url.lastPathComponent
        UserDefaults.standard.set(names, forKey: Self.lastKey)
    }

    // MARK: Listing

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
    var folderLabel: String { isAppFolder ? "Typewrencher" : folder.lastPathComponent }

    // Where the folder is in the Files app, for the drawer's last line. iOS does not say where an arbitrary chosen
    // folder is, so only the places that are recognizable get a location; any other folder is shown by its name.
    var displayPath: String {
        if isAppFolder { return (UIDevice.current.userInterfaceIdiom == .pad ? "On My iPad" : "On My iPhone") + "/" + folderLabel }
        let path = folder.standardizedFileURL.resolvingSymlinksInPath().path
        if let range = path.range(of: "/com~apple~CloudDocs") {
            return "iCloud Drive" + String(path[range.upperBound...])
        }
        return folderLabel
    }

    // Like the page's export name: no path or reserved characters, no ".txt", no spaces or dots at the ends.
    static func cleanName(_ raw: String) -> String {
        var name = raw.unicodeScalars.filter { $0.value >= 0x20 && !"\\/:*?\"<>|".unicodeScalars.contains($0) }
            .map(String.init).joined()
        if name.lowercased().hasSuffix(".txt") { name.removeLast(4) }
        return name.trimmingCharacters(in: CharacterSet(charactersIn: " .").union(.whitespacesAndNewlines))
    }

    // MARK: Untitled files

    // The untitled files this app created, as "folder key|name". Only these, and only while they are still empty, are
    // ever removed. An earlier version stored bare names, all in the app folder; they are read as "app|name".
    private static let untitledKey = "untitledFiles"
    private static var untitled: Set<String> {
        Set((UserDefaults.standard.stringArray(forKey: untitledKey) ?? []).map { $0.contains("|") ? $0 : "app|" + $0 })
    }
    private static func entry(_ url: URL) -> String { key(of: url) + "|" + url.lastPathComponent }

    func isUntitled(_ url: URL) -> Bool { Self.untitled.contains(Self.entry(url)) }

    func setUntitled(_ url: URL, _ on: Bool) {
        var all = Self.untitled
        if on { all.insert(Self.entry(url)) } else { all.remove(Self.entry(url)) }
        UserDefaults.standard.set(Array(all), forKey: Self.untitledKey)
    }

    // An untitled file this app created that is still empty (zero bytes) is deleted when the person leaves it.
    // iOS has no Trash for an app's own files; nothing is lost, the file has no content. Any other file is kept,
    // including an empty untitled.txt the person made themselves in a chosen folder.
    func removeIfEmptyUntitled(_ url: URL) {
        guard isUntitled(url) else { return }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue
        guard size == 0 else { if size == nil { setUntitled(url, false) }; return }
        if (try? FileManager.default.removeItem(at: url)) != nil { setUntitled(url, false) }
    }

    // A file with this text under a free name in the folder (name.txt, name 2.txt, ...): used to keep text that could not be
    // saved where it belongs. It is an ordinary file, never one of the untitled files the app may delete.
    func createFile(named base: String, text: String) throws -> URL {
        let fm = FileManager.default
        var url = folder.appendingPathComponent(base + ".txt")
        var number = 2
        while fm.fileExists(atPath: url.path) {
            url = folder.appendingPathComponent("\(base) \(number).txt")
            number += 1
        }
        try Data(text.utf8).write(to: url, options: .atomic)
        return url
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
