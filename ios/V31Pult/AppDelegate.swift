import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = ViewController()
        w.backgroundColor = UIColor(red: 0x17 / 255, green: 0x1B / 255, blue: 0x20 / 255, alpha: 1)
        w.makeKeyAndVisible()
        window = w
        return true
    }
}
