import Foundation
import UniformTypeIdentifiers

// The files drawer lists the .txt files in a document's folder. The App Sandbox only grants the
// document itself, so the folder needs the person's permission once (an Open panel). That permission
// is kept as a security-scoped bookmark, so later launches can list the folder without asking again.
enum FolderAccess {
    private static let key = "folderBookmarks"            // folder path -> bookmark data
    private static var active: [String: URL] = [:]       // granted folders whose security scope is started

    // A URL the app may list and open files in, or nil when the person has not granted this folder
    // (or one above it). Being able to list a folder is not enough: in some places, such as Documents
    // synced with iCloud, the sandbox allows listing the folder but not opening the files in it.
    static func url(for folder: URL) -> URL? {
        let path = folder.standardizedFileURL.path
        if active.keys.contains(where: { covers($0, path) }) { return folder }
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

// Saved permission for single files (security-scoped bookmarks), so Open Recent and reopening the last
// file at launch work under the sandbox: a file opened from Finder or a panel is only granted for that launch.
enum FileAccess {
    private static let key = "fileBookmarks"     // file path -> bookmark data
    private static let lastKey = "lastFile"      // path of the file open when the app last ran
    private static let limit = 40
    private static var active: [String: URL] = [:]

    // Keeps permission for a file the app can reach now (call it right after opening, creating or renaming).
    static func remember(_ url: URL) {
        let path = url.standardizedFileURL.path
        guard let data = try? url.bookmarkData(options: .withSecurityScope, includingResourceValuesForKeys: nil, relativeTo: nil) else { return }
        var all = bookmarks
        all[path] = data
        if all.count > limit, let oldest = order.first(where: { $0 != path }) { all[oldest] = nil }
        UserDefaults.standard.set(all, forKey: key)
        UserDefaults.standard.set(order.filter { $0 != path && all[$0] != nil } + [path], forKey: key + "Order")
    }

    // Starts the saved permission for a file the app cannot reach otherwise. False when there is none.
    static func start(_ url: URL) -> Bool {
        let path = url.standardizedFileURL.path
        if active[path] != nil { return true }
        var stale = false
        guard let data = bookmarks[path],
              let resolved = try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &stale),
              resolved.startAccessingSecurityScopedResource() else { return false }
        active[path] = resolved
        if stale { remember(resolved) }
        return true
    }

    // Ends a permission started with start(_:), once the app has moved on to another file.
    static func stop(_ url: URL) {
        let path = url.standardizedFileURL.path
        active.removeValue(forKey: path)?.stopAccessingSecurityScopedResource()
    }

    static var lastFile: URL? {
        get { UserDefaults.standard.string(forKey: lastKey).map { URL(fileURLWithPath: $0) } }
        set { UserDefaults.standard.set(newValue?.standardizedFileURL.path, forKey: lastKey) }
    }

    private static var bookmarks: [String: Data] { UserDefaults.standard.dictionary(forKey: key) as? [String: Data] ?? [:] }
    private static var order: [String] { UserDefaults.standard.stringArray(forKey: key + "Order") ?? [] }
}

// Calls back, a moment after the last change, when a folder's files are added, removed, renamed or saved,
// or when a single file is written, replaced, renamed or deleted. A replaced file (an atomic save, by this
// app or another) ends the watch on the old file, so the owner watches the path again after each callback.
final class PathWatcher {
    private let source: DispatchSourceFileSystemObject
    private var pending: DispatchWorkItem?

    init?(path url: URL, onChange: @escaping () -> Void) {
        let fd = open(url.path, O_EVTONLY)
        guard fd >= 0 else { return nil }
        source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: [.write, .extend, .rename, .delete], queue: .main)
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
