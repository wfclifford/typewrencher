import Foundation
import UniformTypeIdentifiers

// Every read and write of a document, and the listing of a folder, goes through NSFileCoordinator on a background queue.
// Coordination means another process (iCloud, a file provider, another app) never sees a half-written file and the app
// never reads one; the background queue means a slow file (an iCloud file that has to be downloaded, a slow drive) can
// never freeze the page. Reads run side by side; writes run one at a time in the order they were asked for, so two saves
// of the same file can never swap places. Only metadata questions that cost nothing (does it exist, how big) stay on the
// caller's thread.
nonisolated enum FileAccess {
    private static let readQueue = DispatchQueue(label: "Typewrencher.files.read", qos: .userInitiated, attributes: .concurrent)
    private static let writeQueue = DispatchQueue(label: "Typewrencher.files.write", qos: .userInitiated)

    // MARK: Reading

    // The file's text, read under a coordinated read that does not ask other presenters to save first.
    static func read(_ url: URL) async throws -> String {
        try await run(on: readQueue) {
            var coordinationError: NSError?
            var outcome: Result<String, Error>?
            NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: .withoutChanges, error: &coordinationError) { readURL in
                outcome = Result { try TextFile.read(readURL) }
            }
            if let coordinationError { throw coordinationError }
            guard let outcome else { throw CocoaError(.fileReadUnknown) }
            return try outcome.get()
        }
    }

    // The .txt files in the folder, newest first, for the files drawer. Only what the folder already knows (names and
    // dates) is asked for, so listing never starts a download. A folder that cannot be listed gives an empty list.
    static func textFiles(in folder: URL) async -> [(name: String, modified: Date)] {
        let listed: [(name: String, modified: Date)]? = try? await run(on: readQueue) {
            var coordinationError: NSError?
            var found: [(name: String, modified: Date)] = []
            NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: folder, options: [.withoutChanges, .immediatelyAvailableMetadataOnly], error: &coordinationError) { listURL in
                let keys: [URLResourceKey] = [.contentModificationDateKey, .contentTypeKey, .isRegularFileKey]
                guard let urls = try? FileManager.default.contentsOfDirectory(at: listURL, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else { return }
                found = urls.compactMap { url -> (name: String, modified: Date)? in
                    guard let values = try? url.resourceValues(forKeys: Set(keys)), values.isRegularFile == true,
                          values.contentType == .plainText || url.pathExtension.lowercased() == "txt" else { return nil }
                    return (url.lastPathComponent, values.contentModificationDate ?? .distantPast)
                }
            }
            if let coordinationError { throw coordinationError }
            return found.sorted { $0.modified > $1.modified }
        }
        return listed ?? []
    }

    // MARK: Writing

    // The text swapped into the file as a replacement (see TextFile.write for the atomic swap and its fallback).
    static func write(_ text: String, to url: URL) async throws {
        try await run(on: writeQueue) {
            try coordinatedWrite(at: url, options: .forReplacing) { try TextFile.write(text, to: $0) }
        }
    }

    // A new file with these contents under a free name in the folder: base.txt, base 2.txt, base 3.txt, ... A name that is
    // taken (even by a file that appears while this runs) is skipped, never overwritten.
    static func create(named base: String, contents: Data, in folder: URL) async throws -> URL {
        try await run(on: writeQueue) {
            var number = 1
            while true {
                let url = folder.appendingPathComponent(number == 1 ? base + ".txt" : "\(base) \(number).txt")
                let created: Bool = try coordinatedWrite(at: url, options: []) { writeURL in
                    do {
                        // A new file has no earlier content to lose, so no atomic swap; Foundation refuses to combine
                        // .withoutOverwriting with .atomic (a fatal error, not a thrown one).
                        try contents.write(to: writeURL, options: .withoutOverwriting)
                        return true
                    } catch let error as CocoaError where error.code == .fileWriteFileExists {
                        return false
                    }
                }
                if created { return url }
                number += 1
            }
        }
    }

    // Renames or moves a file. On a case-insensitive volume a rename that only changes case can be refused as "already
    // exists"; then it goes through a temporary name in the same folder.
    static func move(_ url: URL, to target: URL, caseOnly: Bool) async throws {
        try await run(on: writeQueue) {
            let coordinator = NSFileCoordinator(filePresenter: nil)
            var coordinationError: NSError?
            var failure: Error?
            if caseOnly {
                // Both names are the same item on such a volume, so it is coordinated once.
                coordinator.coordinate(writingItemAt: url, options: .forMoving, error: &coordinationError) { from in
                    do { try moveViaTemporaryName(from, to: target); coordinator.item(at: from, didMoveTo: target) } catch { failure = error }
                }
            } else {
                coordinator.coordinate(writingItemAt: url, options: .forMoving, writingItemAt: target, options: .forReplacing, error: &coordinationError) { from, to in
                    do { try FileManager.default.moveItem(at: from, to: to); coordinator.item(at: from, didMoveTo: to) } catch { failure = error }
                }
            }
            if let coordinationError { throw coordinationError }
            if let failure { throw failure }
        }
    }

    private static func moveViaTemporaryName(_ url: URL, to target: URL) throws {
        do {
            try FileManager.default.moveItem(at: url, to: target)
        } catch {
            let temporary = url.deletingLastPathComponent().appendingPathComponent(".typewrencher-rename-\(UUID().uuidString).txt")
            try FileManager.default.moveItem(at: url, to: temporary)
            do { try FileManager.default.moveItem(at: temporary, to: target) } catch {
                try? FileManager.default.moveItem(at: temporary, to: url)   // put it back
                throw error
            }
        }
    }

    enum Removal { case removed, kept, missing }

    // Deletes the file only if it is empty (zero bytes): the size is checked inside the coordinated delete, so a file
    // that gained text a moment earlier is never removed.
    static func removeIfEmpty(_ url: URL) async -> Removal {
        let outcome: Removal? = try? await run(on: writeQueue) {
            try coordinatedWrite(at: url, options: .forDeleting) { deleteURL in
                guard let size = (try? FileManager.default.attributesOfItem(atPath: deleteURL.path)[.size] as? NSNumber)?.intValue else { return Removal.missing }
                guard size == 0 else { return .kept }
                return (try? FileManager.default.removeItem(at: deleteURL)) != nil ? .removed : .kept
            }
        }
        return outcome ?? .kept
    }

    // MARK: Plumbing

    private static func coordinatedWrite<T>(at url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> T) throws -> T {
        var coordinationError: NSError?
        var outcome: Result<T, Error>?
        NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: options, error: &coordinationError) { writeURL in
            outcome = Result { try body(writeURL) }
        }
        if let coordinationError { throw coordinationError }
        guard let outcome else { throw CocoaError(.fileWriteUnknown) }
        return try outcome.get()
    }

    // Runs blocking file work on a queue and waits for it without blocking the caller's thread.
    private static func run<T>(on queue: DispatchQueue, _ work: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                do { continuation.resume(returning: try work()) } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
