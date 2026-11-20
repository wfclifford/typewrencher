import SwiftUI

// One window per document. The system document browser (File > Open, Open Recent, Finder double-click)
// is the library, as decided in the planning brief.
@main
struct TypewrencherApp: App {
    var body: some Scene {
        DocumentGroup(newDocument: TextDocument()) { file in
            WebEditorView(document: file.$document, name: file.fileURL?.deletingPathExtension().lastPathComponent ?? "")
                .frame(minWidth: 480, minHeight: 360)
        }
    }
}
