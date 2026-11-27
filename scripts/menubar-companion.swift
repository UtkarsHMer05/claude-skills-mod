// Keeps SwiftBar (and with it the usage item in the menu bar) running only
// while the Claude desktop app is open: starts SwiftBar when Claude opens and
// quits it when Claude quits. While Claude runs, the usage item shows only
// when Claude is the app in front, and hides when you switch to another app.
// It waits on macOS's own app launch/quit/switch notifications, so it uses no
// CPU in between.
//
// Built and started by scripts/install-menubar-watcher.sh.
// Usage: menubar-companion [follow-bundle-id]   (default: the Claude app)
import AppKit

let follow = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "com.anthropic.claudefordesktop"
let swiftBarID = "com.ameba.SwiftBar"

func isRunning(_ id: String) -> Bool {
    !NSRunningApplication.runningApplications(withBundleIdentifier: id).isEmpty
}

func startBar() {
    guard !isRunning(swiftBarID),
          let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: swiftBarID) else { return }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    config.addsToRecentItems = false
    NSWorkspace.shared.openApplication(at: url, configuration: config)
}

func stopBar() {
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: swiftBarID) {
        app.terminate()
    }
}

/// Show or hide the usage item (a SwiftBar plugin) without quitting SwiftBar.
var shown: Bool?
func setVisible(_ visible: Bool, force: Bool = false) {
    if !force && shown == visible { return }
    shown = visible
    let action = visible ? "enableplugin" : "disableplugin"
    guard let url = URL(string: "swiftbar://\(action)?name=usage-card") else { return }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    config.addsToRecentItems = false
    NSWorkspace.shared.open(url, configuration: config)
}

func claudeInFront() -> Bool {
    NSWorkspace.shared.frontmostApplication?.bundleIdentifier == follow
}

func bundleID(_ note: Notification) -> String? {
    (note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication)?.bundleIdentifier
}

let center = NSWorkspace.shared.notificationCenter
center.addObserver(forName: NSWorkspace.didLaunchApplicationNotification, object: nil, queue: .main) { note in
    if bundleID(note) == follow {
        startBar()
        // Give SwiftBar a moment to start, then match the app in front.
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { setVisible(claudeInFront(), force: true) }
    }
}
center.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { note in
    let id = bundleID(note)
    // SwiftBar coming forward (its own menu, a URL it handles) changes nothing.
    if id == swiftBarID || !isRunning(swiftBarID) { return }
    setVisible(id == follow)
}
center.addObserver(forName: NSWorkspace.didTerminateApplicationNotification, object: nil, queue: .main) { note in
    if bundleID(note) == follow { stopBar() }
}

// Match the app's state now, e.g. after a login or a reinstall.
if isRunning(follow) {
    startBar()
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { setVisible(claudeInFront(), force: true) }
} else {
    stopBar()
}

RunLoop.main.run()
