import Foundation

// Documents are plain UTF-8 .txt files with no per-document settings.
enum TextFile {
    struct NotUTF8: LocalizedError {
        var errorDescription: String? { "it is not UTF-8 text" }
    }

    static func read(_ url: URL) throws -> String {
        let data = try Data(contentsOf: url)
        guard let text = String(data: data, encoding: .utf8) else { throw NotUTF8() }
        return text
    }

    // Writes atomically (a new file swapped into place) when the app may write in the file's folder.
    // With access to the file alone, which is what the sandbox grants for a file opened from Finder or
    // an Open panel, the swap is not allowed, so the file is rewritten in place instead.
    static func write(_ text: String, to url: URL, atomically: Bool) throws {
        let data = Data(text.utf8)
        if atomically {
            do { try data.write(to: url, options: .atomic); return } catch let error as CocoaError where error.code == .fileWriteNoPermission {
                // fall through to the in-place write
            }
        }
        let handle = try FileHandle(forWritingTo: url)
        defer { try? handle.close() }
        try handle.truncate(atOffset: 0)
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }
}
