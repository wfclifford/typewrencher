import Foundation
import UniformTypeIdentifiers

// The files drawer lists the .txt files in a document's folder. The App Sandbox only grants the
// document itself, so the folder needs the person's permission once (an Open panel). That permission
// is kept as a security-scoped bookmark, so later launches can list the folder without asking again.
enum FolderAccess {
    private static let key = "folderBookmarks"            // folder path -> bookmark data
    private static var active: [String: URL] = [:]       // granted folders whose security scope is started

    // A URL the app may list, or nil when the person has not granted this folder (or one above it).
    static func url(for folder: URL) -> URL? {
        let path = folder.standardizedFileURL.path
        if active.keys.contains(where: { covers($0, path) }) { return folder }
        if (try? FileManager.default.contentsOfDirectory(atPath: path)) != nil { return folder } // already in the sandbox
        for (granted, data) in bookmarks where covers(granted, path) {
            var stale = false
            guard let url = try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale),
                  url.startAccessingSecurityScopedResource() else { continue }
            active[granted] = url
            if stale { save(url, as: granted) }
            return folder
        }
        return nil
    }

    // Keeps the folder the person chose in the Open panel, for this launch and later ones.
    static func remember(_ folder: URL) {
        let path = folder.standardizedFileURL.path
        if active[path] == nil, folder.startAccessingSecurityScopedResource() { active[path] = folder }
        save(folder, as: path)
    }

    // The .txt files in the folder, newest first.
    static func textFiles(in folder: URL) -> [(name: String, modified: Date)]? {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .contentTypeKey, .isRegularFileKey]
        guard let urls = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: keys,
                                                                       options: [.skipsHiddenFiles]) else { return nil }
        return urls.compactMap { url -> (name: String, modified: Date)? in
            guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                  values.contentType == .plainText || url.pathExtension.lowercased() == "txt" else { return nil }
            return (url.lastPathComponent, values.contentModificationDate ?? .distantPast)
        }
        .sorted { $0.modified > $1.modified }
    }

    // The folder's path for display, with the person's real home folder as "~" (inside the sandbox
    // NSHomeDirectory() is the app's container, not the home folder).
    static func displayPath(_ folder: URL) -> String {
        let path = folder.standardizedFileURL.path
        guard let entry = getpwuid(getuid()), let dir = entry.pointee.pw_dir else { return path }
        let home = String(cString: dir)
        return path == home ? "~" : path.hasPrefix(home + "/") ? "~" + path.dropFirst(home.count) : path
    }

    private static var bookmarks: [String: Data] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Data] ?? [:]
    }
    private static func save(_ url: URL, as path: String) {
        guard let data = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        var all = bookmarks
        all[path] = data
        UserDefaults.standard.set(all, forKey: key)
    }
    private static func covers(_ granted: String, _ path: String) -> Bool {
        path == granted || path.hasPrefix(granted.hasSuffix("/") ? granted : granted + "/")
    }
}

// Calls back, a moment after the last change, when files are added, removed, renamed or saved in a folder.
// Saving replaces the file, so the folder itself changes and this fires then too.
final class FolderWatcher {
    private let source: DispatchSourceFileSystemObject
    private var pending: DispatchWorkItem?

    init?(folder: URL, onChange: @escaping () -> Void) {
        let fd = open(folder.path, O_EVTONLY)
        guard fd >= 0 else { return nil }
        source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .rename, .delete], queue: .main)
        source.setEventHandler { [weak self] in
            guard let self else { return }
            self.pending?.cancel()
            let work = DispatchWorkItem(block: onChange)
            self.pending = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
        }
        source.setCancelHandler { close(fd) }
        source.resume()
    }

    deinit { source.cancel() }
}
