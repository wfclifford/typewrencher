import Foundation

// Documents are plain UTF-8 .txt files with no per-document settings. These are the raw reads and writes; the app goes
// through FileAccess, which runs them under file coordination on a background queue.
nonisolated enum TextFile {
    struct NotUTF8: LocalizedError {
        var errorDescription: String? { "it is not UTF-8 text" }
    }

    static func read(_ url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw NotUTF8() }
        return text
    }

    // A new file swapped into place, so a crash or a full disk never leaves half a document. A file the person opened
    // with the file picker may be writable while its folder is not (access to the file alone), which the swap needs; then
    // the file is rewritten in place instead, as the Mac app does.
    static func write(_ text: String, to url: URL) throws {
        let data = Data(text.utf8)
        do {
            try data.write(to: url, options: .atomic)
            return
        } catch let error as CocoaError where error.code == .fileWriteNoPermission {
            // fall through to the in-place write
        }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.truncate(atOffset: 0)
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }
}
