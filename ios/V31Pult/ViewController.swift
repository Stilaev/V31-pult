import CoreAudioKit
import UIKit
import WebKit

/// Экран пульта: интерфейс из папки web (тот же, что на Android) в WKWebView,
/// связь с модулем — MidiLink (CoreMIDI, Bluetooth MIDI и USB).
final class ViewController: UIViewController, WKScriptMessageHandler, UIAdaptivePresentationControllerDelegate {
    private var web: WKWebView!
    private let link = MidiLink()
    private var pendingKind = "ble"

    override func loadView() {
        let config = WKWebViewConfiguration()
        let ucc = WKUserContentController()
        ucc.add(WeakHandler(self), name: "v31")
        config.userContentController = ucc
        web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0x17 / 255, green: 0x1B / 255, blue: 0x20 / 255, alpha: 1)
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        UIApplication.shared.isIdleTimerDisabled = true
        link.onEvent = { [weak self] e in self?.emit(e) }
        if let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            web.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
        }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // MARK: - JS → приложение

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "connect":
            let kind = body["kind"] as? String ?? "ble"
            pendingKind = kind
            if kind == "ble" {
                showBluetooth()
            } else if !link.connect(kind: "usb") {
                emit(["type": "error", "message": "Модуль по USB не найден. Подключите V31 (порт USB COMPUTER) к iPad и включите модуль. " + link.describeEndpoints()])
            }
        case "disconnect":
            link.close(byUser: true)
        case "send":
            if let hex = body["hex"] as? String {
                link.send(hex.split(separator: " ").compactMap { UInt8($0, radix: 16) })
            }
        case "share":
            share(name: body["name"] as? String ?? "V31.json", text: body["text"] as? String ?? "")
        default:
            break
        }
    }

    // MARK: - Bluetooth MIDI

    /// Системное окно поиска Bluetooth MIDI. Модуль: MENU → SYSTEM → Bluetooth → Bluetooth MIDI = ON.
    private func showBluetooth() {
        // Если модуль уже подключён к iPad по Bluetooth — сразу открываем его.
        if link.connect(kind: "ble") { return }
        let bt = CABTMIDICentralViewController()
        bt.title = "Bluetooth MIDI"
        bt.navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(bluetoothDone))
        let nav = UINavigationController(rootViewController: bt)
        nav.modalPresentationStyle = .formSheet
        nav.presentationController?.delegate = self
        present(nav, animated: true)
        emit(["type": "status", "message": "Выберите «V31 MIDI» и нажмите «Connect», затем «Готово»"])
    }

    @objc private func bluetoothDone() {
        dismiss(animated: true) { [weak self] in self?.afterBluetooth() }
    }

    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        afterBluetooth()
    }

    private func afterBluetooth() {
        // CoreMIDI добавляет устройство с небольшой задержкой.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self else { return }
            if !self.link.connect(kind: "ble") {
                self.emit(["type": "error", "message": "V31 не появился среди MIDI-устройств. Проверьте, что в окне Bluetooth модуль в состоянии «Connected». " + self.link.describeEndpoints()])
            }
        }
    }

    // MARK: - Сохранение файлов

    private func share(name: String, text: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try text.data(using: .utf8)?.write(to: url)
        } catch {
            emit(["type": "error", "message": "Не удалось подготовить файл: \(error.localizedDescription)"])
            return
        }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        present(vc, animated: true)
    }

    // MARK: - приложение → JS

    private func emit(_ event: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: event),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.v31NativeEvent&&window.v31NativeEvent(\(json))"
        if Thread.isMainThread {
            web.evaluateJavaScript(js, completionHandler: nil)
        } else {
            DispatchQueue.main.async { self.web.evaluateJavaScript(js, completionHandler: nil) }
        }
    }
}

/// WKUserContentController держит обработчик сильной ссылкой — разрываем цикл.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
