import WebKit
import UniformTypeIdentifiers

// Serves the bundled web app from typewrencher://app/ so the page's Content Security Policy
// ('self') keeps matching and no local server is needed. The built site is a folder reference
// named "site" in the app bundle (see mac/README.md).
final class SiteSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "typewrencher"
    static let startURL = URL(string: "typewrencher://app/index.html")!

    private let root: URL? = Bundle.main.resourceURL?.appendingPathComponent("site", isDirectory: true)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let root, let url = task.request.url else { return fail(task, .fileDoesNotExist) }
        var path = url.path
        if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        // Refuse anything that escapes the site folder.
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"),
              let data = try? Data(contentsOf: file) else { return fail(task, .fileDoesNotExist) }
        let type = UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let headers = ["Content-Type": type, "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers) else {
            return fail(task, .unknown)
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func fail(_ task: WKURLSchemeTask, _ code: URLError.Code) {
        task.didFailWithError(URLError(code))
    }
}
