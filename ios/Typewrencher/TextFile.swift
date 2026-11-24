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

    // A new file swapped into place, so a crash or a full disk never leaves half a document.
    static func write(_ text: String, to url: URL) throws {
        try Data(text.utf8).write(to: url, options: .atomic)
    }
}
