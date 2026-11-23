import SwiftUI
import WebKit
import os

// Hosts the web view that runs the page, which is the editor. Phase 1: the bridge answers "ready"
// and stubs every other message; files are not part of this phase. Bridge protocol 1 is unchanged.
struct WebEditorView: UIViewRepresentable {
    func makeCoordinator() -> Bridge { Bridge() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SiteSchemeHandler(), forURLScheme: SiteSchemeHandler.scheme)
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "typewrencher")
        #if DEBUG
        context.coordinator.installConsoleForwarding(in: config.userContentController)
        #endif
        let web = WKWebView(frame: .zero, configuration: config)
        // Let the page's own env(safe-area-inset-*) handle the notch and home indicator, as in Safari.
        web.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        web.isInspectable = true   // Safari > Develop > the device or simulator
        #endif
        web.navigationDelegate = context.coordinator
        web.load(URLRequest(url: SiteSchemeHandler.startURL))
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {}

    static func dismantleUIView(_ web: WKWebView, coordinator: Bridge) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "typewrencher", contentWorld: .page)
    }

    // The native end of the bridge (js/host.js). Answers "ready"; every other message is a stub.
    final class Bridge: NSObject, WKScriptMessageHandlerWithReply, WKScriptMessageHandler, WKNavigationDelegate {
        private let log = Logger(subsystem: "Typewrencher", category: "bridge")

        // Debug builds also append every line to a file in the app's tmp folder, so a simulator run can be
        // read with `simctl get_app_container ... data` without Web Inspector.
        func trace(_ line: String) {
            log.info("\(line, privacy: .public)")
            #if DEBUG
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("twdebug.log")
            let data = Data((line + "\n").utf8)
            if let handle = try? FileHandle(forWritingTo: url) { handle.seekToEndOfFile(); handle.write(data); try? handle.close() }
            else { try? data.write(to: url) }
            #endif
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { trace("navigation failed (provisional): \(error)") }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { trace("navigation failed: \(error)") }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { trace("navigation finished") }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { trace("web content process terminated") }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                                   replyHandler: @escaping (Any?, String?) -> Void) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
                return replyHandler(nil, "bad message")
            }
            trace("page -> native: \(type)")
            switch type {
            case "export":
                // Not stubbed as success: the page would show "Done" for a file that was never written.
                replyHandler(nil, "not available yet")
            default:
                replyHandler(nil, nil)   // ready and all other messages
            }
        }

        // Debug builds only: page errors and Content Security Policy violations go to the log, so a
        // run in the simulator can be checked without Web Inspector.
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            trace("page console: \(String(describing: message.body))")
        }

        func installConsoleForwarding(in controller: WKUserContentController) {
            controller.add(self, contentWorld: .page, name: "twdebug")
            let js = """
            (() => {
              const send = m => { try { webkit.messageHandlers.twdebug.postMessage(String(m)); } catch (_) {} };
              window.addEventListener('error', e => send('error: ' + e.message + ' @' + e.filename + ':' + e.lineno));
              window.addEventListener('unhandledrejection', e => send('unhandledrejection: ' + e.reason));
              document.addEventListener('securitypolicyviolation', e => send('csp: ' + e.violatedDirective + ' ' + e.blockedURI));
              const err = console.error; console.error = (...a) => { send('console.error: ' + a.join(' ')); err.apply(console, a); };
              const warn = console.warn; console.warn = (...a) => { send('console.warn: ' + a.join(' ')); warn.apply(console, a); };
              window.addEventListener('load', () => send('loaded; host=' + (typeof window.TypewrencherHost) + ' width=' + innerWidth + ' dpr=' + devicePixelRatio));
            })();
            """
            controller.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page))
        }
    }
}
