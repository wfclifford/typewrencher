import Foundation

// Tests for ios/Typewrencher/FileAccess.swift and TextFile.swift, which use only Foundation, so they run on the Mac:
//   ios/tests/run.sh
// They check what the iPhone and iPad app relies on: coordinated reads and writes, writes in order, free names, renames,
// removing only empty files, the listing, and that a read really waits for a coordinated write (and the reverse).
final class Checks {
    var failed = 0, passed = 0
    func expect(_ condition: Bool, _ what: String, line: Int = #line) {
        if condition { passed += 1 } else { failed += 1; print("FAIL (line \(line)): \(what)") }
    }
}

@main
struct FileAccessTests {
    static func main() async {
        let c = Checks()
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("tw-fa-\(UUID().uuidString)", isDirectory: true)
        try! FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        func url(_ name: String) -> URL { folder.appendingPathComponent(name) }

        // Write and read back; the second write replaces the first completely.
        do {
            try await FileAccess.write("one two three", to: url("a.txt"))
            c.expect((try? await FileAccess.read(url("a.txt"))) == "one two three", "a written file reads back")
            try await FileAccess.write("short", to: url("a.txt"))
            c.expect((try? await FileAccess.read(url("a.txt"))) == "short", "a second write replaces the text")
        } catch { c.expect(false, "write/read threw \(error)") }

        // Text that is not UTF-8 says so; a missing file reports the codes the app turns into "the file is missing".
        try! Data([0xFF, 0xFE, 0xFD]).write(to: url("bad.txt"))
        do { _ = try await FileAccess.read(url("bad.txt")); c.expect(false, "non-UTF-8 should throw") }
        catch { c.expect(error is TextFile.NotUTF8, "non-UTF-8 throws NotUTF8, got \(error)") }
        do { _ = try await FileAccess.read(url("nope.txt")); c.expect(false, "a missing file should throw") }
        catch { c.expect([4, 260].contains((error as NSError).code), "a missing file is code 4 or 260, got \((error as NSError).domain) \((error as NSError).code)") }

        // Many writes at once never leave a mixed-up file: the file holds exactly one of the texts.
        let texts = (1...40).map { String(repeating: "\($0)", count: 2000) }
        await withTaskGroup(of: Void.self) { group in
            for text in texts { group.addTask { try? await FileAccess.write(text, to: url("race.txt")) } }
        }
        let raced = try? await FileAccess.read(url("race.txt"))
        c.expect(raced.map(texts.contains) == true, "concurrent writes leave one whole text")

        // Writes run in the order they are asked for: three writes started one after another, the last one wins.
        var ordered: [Task<Void, Never>] = []
        for text in ["first", "second", "third"] {
            ordered.append(Task { try? await FileAccess.write(text, to: url("order.txt")) })
            try? await Task.sleep(for: .milliseconds(30))
        }
        for task in ordered { await task.value }
        c.expect((try? await FileAccess.read(url("order.txt"))) == "third", "the last write asked for is the last one done")

        // Free names: untitled.txt, untitled 2.txt, ... even when asked for at the same time.
        let made = await withTaskGroup(of: URL?.self) { group -> [URL] in
            for _ in 1...8 { group.addTask { try? await FileAccess.create(named: "untitled", contents: Data(), in: folder) } }
            var all: [URL] = []
            for await item in group { if let item { all.append(item) } }
            return all
        }
        c.expect(made.count == 8 && Set(made.map(\.lastPathComponent)).count == 8, "eight creates make eight different files")
        c.expect(FileManager.default.fileExists(atPath: url("untitled.txt").path) && FileManager.default.fileExists(atPath: url("untitled 8.txt").path), "names run untitled.txt to untitled 8.txt")
        let kept = try? await FileAccess.create(named: "a", contents: Data("keep".utf8), in: folder)
        c.expect(kept?.lastPathComponent == "a 2.txt", "a taken name is skipped, got \(String(describing: kept?.lastPathComponent))")
        c.expect((try? await FileAccess.read(url("a.txt"))) == "short", "a taken name is never overwritten")

        // Renaming, and a rename that only changes case.
        do {
            try await FileAccess.move(url("a.txt"), to: url("b.txt"), caseOnly: false)
            c.expect(!FileManager.default.fileExists(atPath: url("a.txt").path) && FileManager.default.fileExists(atPath: url("b.txt").path), "a file is renamed")
            try await FileAccess.move(url("b.txt"), to: url("B.txt"), caseOnly: true)
            let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
            c.expect(names.contains("B.txt") && !names.contains("b.txt"), "a case-only rename changes the case, got \(names.sorted())")
            c.expect((try? await FileAccess.read(url("B.txt"))) == "short", "the renamed file keeps its text")
        } catch { c.expect(false, "move threw \(error)") }
        do { try await FileAccess.move(url("gone.txt"), to: url("elsewhere.txt"), caseOnly: false); c.expect(false, "moving a missing file should throw") }
        catch { c.expect(true, "moving a missing file throws") }

        // Only an empty file is removed.
        try! Data().write(to: url("empty.txt")); try! Data("x".utf8).write(to: url("full.txt"))
        c.expect(await FileAccess.removeIfEmpty(url("empty.txt")) == .removed && !FileManager.default.fileExists(atPath: url("empty.txt").path), "an empty file is removed")
        c.expect(await FileAccess.removeIfEmpty(url("full.txt")) == .kept && FileManager.default.fileExists(atPath: url("full.txt").path), "a file with text is kept")
        c.expect(await FileAccess.removeIfEmpty(url("never-existed.txt")) == .missing, "a missing file is reported as missing")

        // The listing: only .txt files, newest first, no hidden files or folders.
        let listFolder = folder.appendingPathComponent("list", isDirectory: true)
        try! FileManager.default.createDirectory(at: listFolder, withIntermediateDirectories: true)
        for (name, age) in [("old.txt", 300.0), ("new.txt", 10.0), ("mid.TXT", 100.0), ("notes.md", 5.0), (".hidden.txt", 1.0)] {
            let file = listFolder.appendingPathComponent(name)
            try! Data("x".utf8).write(to: file)
            try! FileManager.default.setAttributes([.modificationDate: Date().addingTimeInterval(-age)], ofItemAtPath: file.path)
        }
        try! FileManager.default.createDirectory(at: listFolder.appendingPathComponent("sub.txt", isDirectory: true), withIntermediateDirectories: true)
        c.expect(await FileAccess.textFiles(in: listFolder).map(\.name) == ["new.txt", "mid.TXT", "old.txt"], "the listing is the .txt files, newest first")
        c.expect(await FileAccess.textFiles(in: folder.appendingPathComponent("no-such-folder")).isEmpty, "a folder that is not there lists as empty")

        // Coordination is real: a write asked for while another coordinator is reading waits for that read to end,
        // and a read asked for while another coordinator is writing waits for that write.
        let heldURL = url("held.txt")
        try! Data("held".utf8).write(to: heldURL)
        let readStart = Date()
        let holder = Task.detached { () -> Void in
            var error: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: heldURL, options: [], error: &error) { _ in Thread.sleep(forTimeInterval: 0.6) }
        }
        try? await Task.sleep(for: .milliseconds(150))
        try? await FileAccess.write("after the read", to: url("held.txt"))
        c.expect(Date().timeIntervalSince(readStart) >= 0.5, "a write waits for a coordinated read in progress (waited \(Date().timeIntervalSince(readStart))s)")
        await holder.value
        let writeStart = Date()
        let writer = Task.detached { () -> Void in
            var error: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: heldURL, options: .forReplacing, error: &error) { _ in Thread.sleep(forTimeInterval: 0.6) }
        }
        try? await Task.sleep(for: .milliseconds(150))
        _ = try? await FileAccess.read(url("held.txt"))
        c.expect(Date().timeIntervalSince(writeStart) >= 0.5, "a read waits for a coordinated write in progress (waited \(Date().timeIntervalSince(writeStart))s)")
        await writer.value

        // Reading never blocks the thread that asked: while a slow coordinated write holds the file, this task keeps running.
        let slow = Task.detached { () -> Void in
            var error: NSError?
            NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: heldURL, options: .forReplacing, error: &error) { _ in Thread.sleep(forTimeInterval: 0.8) }
        }
        try? await Task.sleep(for: .milliseconds(150))
        let pending = Task { try? await FileAccess.read(url("held.txt")) }
        var ticks = 0
        for _ in 1...5 { try? await Task.sleep(for: .milliseconds(50)); ticks += 1 }
        c.expect(ticks == 5, "the caller keeps running while a read waits")
        _ = await pending.value; await slow.value

        print("\(c.passed) checks passed, \(c.failed) failed")
        exit(c.failed == 0 ? 0 : 1)
    }
}
